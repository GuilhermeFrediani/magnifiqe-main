# Code Analysis Command

**Arguments provided:** {{ args }}

## Instructions for the Agent
You have been triggered via the `/code-analysis` slash command. 
1. Perform a deep AST-aware analysis using `smart_outline` on the provided `args` (which should be file paths or directories).
2. Identify architectural smells, missing tests, or violation of the Caveman coding standards (`02-coding-standards.md`).
3. Report findings structured by file and line number.
4. Stop execution and wait for the user to approve fixes.
