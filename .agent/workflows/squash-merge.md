---
description: On a branch, squash all commits on the branch and merge into main, then delete the branch
---

1. Git squash all new commits on current branch compared to main, properly summarize commit messages. 

2. Merge current branch into main, but in the commit message don't mention "merge". Keep messeages clean and descriptive of the changes. Only mention the changes introduced in this branch as a whole, for example don't mention an issue that were introduced in the branch and was later fixed in the same branch. 

3. Delete the merged branch in both local and remote.