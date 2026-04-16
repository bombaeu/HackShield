import os
import glob

html_files = glob.glob('c:/pp/public/*.html')
old_str = '<a href="#" onclick="event.preventDefault(); showModal(\'Připravujeme\', \'Eventy a hackathony budeme oznamovat brzy!\', \'info\')" class="sidebar-link">'

for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    if old_str in content:
        content = content.replace(old_str, '<a href="events.html" class="sidebar-link">')
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
