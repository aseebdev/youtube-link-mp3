Copy-Item "$env:USERPROFILE\Downloads\cookies.txt" ".\cookies.txt" -Force
git add cookies.txt
git commit -m "refresh cookies"
git push origin main
