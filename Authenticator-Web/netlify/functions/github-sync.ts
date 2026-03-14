import type { Context } from "@netlify/functions";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

async function githubRequest(path: string, method: string = 'GET', body: any = null) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
    
    const headers: Record<string, string> = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
    };

    const options: RequestInit = {
        method,
        headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (response.status === 404 && method === 'GET') {
        return null;
    }

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`GitHub API Error: ${response.status} ${JSON.stringify(errorData)}`);
    }

    return response.json();
}

export const handler = async (event: any, context: Context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, path, data } = JSON.parse(event.body);

        if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
            return {
                statusCode: 500,
                body: JSON.stringify({ success: false, message: "GitHub configuration missing on server." })
            };
        }

        if (action === 'get') {
            const fileData = await githubRequest(path, 'GET');
            if (!fileData) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({ success: true, data: null })
                };
            }
            const content = Buffer.from(fileData.content, 'base64').toString('utf8');
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, data: JSON.parse(content), sha: fileData.sha })
            };
        }

        if (action === 'put') {
            const syncFile = async () => {
                // Get current SHA
                const existingFile = await githubRequest(path, 'GET');
                const sha = existingFile ? existingFile.sha : undefined;
                const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
                
                return githubRequest(path, 'PUT', {
                    message: `Sync ${path}`,
                    content,
                    sha
                });
            };

            try {
                await syncFile();
            } catch (err: any) {
                // If conflict, retry once with fresh sha
                if (err.message.includes('409')) {
                    console.log(`Conflict detected for ${path}, retrying...`);
                    await syncFile();
                } else {
                    throw err;
                }
            }

            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, message: "Data synced to cloud." })
            };
        }

        if (action === 'move') {
            const { oldPath, newPath } = data;
            
            // 1. Get original file content and sha
            const existingFile = await githubRequest(oldPath, 'GET');
            if (!existingFile) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ success: false, message: "Source file not found." })
                };
            }

            // 2. Create new file with same content
            await githubRequest(newPath, 'PUT', {
                message: `Move from ${oldPath} to ${newPath}`,
                content: existingFile.content
            });

            // 3. Delete old file
            await githubRequest(oldPath, 'DELETE', {
                message: `Delete old path after move to ${newPath}`,
                sha: existingFile.sha
            });

            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, message: "Folder/File moved successfully." })
            };
        }

        return {
            statusCode: 400,
            body: JSON.stringify({ success: false, message: "Invalid action." })
        };

    } catch (error: any) {
        console.error('GitHub Sync Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.message })
        };
    }
};
