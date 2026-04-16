import glob
import re

html_files = glob.glob('c:/pp/public/*.html')

for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # We will look for id="contactModal" and the next line for xp-card and replace its style to be wider
    # Simple replace:
    old_style = 'style="border-color: #3b82f6; box-shadow: 0 0 50px rgba(59, 130, 246, 0.2);"'
    new_style = 'style="border-color: #3b82f6; box-shadow: 0 0 50px rgba(59, 130, 246, 0.2); width: 500px; max-width: 95%;"'
    
    if old_style in content:
        content = content.replace(old_style, new_style)
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Updated {f}")
