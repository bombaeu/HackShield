import os
import glob

html_files = glob.glob('c:/pp/public/*.html')
old_str = 'darcerohliku@gmail.com'
new_str = 'hackshield.reklama@atomicmail.io'

for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    if old_str in content:
        content = content.replace(old_str, new_str)
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Replaced in {f}")
