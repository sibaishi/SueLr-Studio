# Workflows Samples

`workflows/` is a version-controlled samples directory.

Rules:

1. Only keep demonstrable example workflows here.
2. Do not save real runtime workflows, uploaded file references, or personal data here.
3. Runtime workflows are stored under the active app data root, normally the system config directory, in its `workflows/` subdirectory.
4. When a sample depends on files, replace them with safe example assets before committing.

Current acceptance-oriented samples:

- `sample-agent-local-text-output.json`: no-key success path for Agent run confirmation and summary
- `sample-agent-local-ai-failure.json`: no-key failure path for diagnosis and summary
- `sample-basic-chat.json`: general AI chat sample, requires configured model/key for a true success run
