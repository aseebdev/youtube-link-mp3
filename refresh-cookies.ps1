# Small pause so copy finishes cleanly
Start-Sleep -Seconds 2

# Copy cookies.txt from Downloads to project folder, overwrite if it exists
Copy-Item "$env:USERPROFILE\Downloads\cookies.txt" ".\cookies.txt" -Force

# Stage both cookies.txt and the script itself
git add cookies.txt
git add refresh-cookies.ps1

# Commit with a clear message
git commit -m "refresh cookies + script update"

# Push to GitHub
git push origin main
