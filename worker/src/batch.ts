import { Env, jsonResponse, getSession } from './utils';

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

export async function handleBatchOperation(request: Request, env: Env): Promise<Response> {
  const session = await getSession(env.SESSIONS, request);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json() as {
    operation: string;
    files?: Array<{ path: string; content: string }>;
    message?: string;
    deleteFiles?: Array<{ path: string; sha: string }>;
  };

  if (!body.operation) {
    return jsonResponse({ error: 'Operation is required' }, 400);
  }

  const additions = (body.files || []).map(f => ({
    path: f.path,
    contents: btoa(unescape(encodeURIComponent(f.content))),
  }));

  const deletions = (body.deleteFiles || []).map(f => ({
    path: f.path,
  }));

  const query = `
    mutation($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) {
        commit {
          oid
          url
        }
      }
    }
  `;

  const headOid = await getHeadOid(session.accessToken, env);

  const variables = {
    input: {
      branch: {
        repositoryNameWithOwner: `${env.REPO_OWNER}/${env.REPO_NAME}`,
        branchName: env.BRANCH,
      },
      message: {
        headline: body.message || `cms: batch ${body.operation}`,
      },
      fileChanges: {
        additions,
        deletions,
      },
      expectedHeadOid: headOid,
    },
  };

  const response = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'yhl-blog-cms',
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await response.json() as {
    data?: { createCommitOnBranch?: { commit?: { oid: string; url: string } } };
    errors?: Array<{ message: string }>;
  };

  if (data.errors) {
    return jsonResponse({ error: 'GraphQL error', details: data.errors }, 400);
  }

  const commit = data.data?.createCommitOnBranch?.commit;
  return jsonResponse({
    success: true,
    commit: commit ? { oid: commit.oid, url: commit.url } : null,
  });
}

async function getHeadOid(token: string, env: Env): Promise<string> {
  const query = `
    query($owner: String!, $name: String!, $branch: String!) {
      repository(owner: $owner, name: $name) {
        ref(qualifiedName: $branch) {
          target {
            oid
          }
        }
      }
    }
  `;

  const response = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'yhl-blog-cms',
    },
    body: JSON.stringify({
      query,
      variables: {
        owner: env.REPO_OWNER,
        name: env.REPO_NAME,
        branch: `refs/heads/${env.BRANCH}`,
      },
    }),
  });

  const data = await response.json() as {
    data: { repository: { ref: { target: { oid: string } } } };
  };

  return data.data?.repository?.ref?.target?.oid || '';
}
