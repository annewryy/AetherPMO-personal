import os

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

results = []
for i, line in enumerate(lines):
    if 'routing' in line.lower() or 'role' in line.lower() or 'switchview' in line.lower() or 'admin' in line.lower():
        results.append(f"{i+1}: {line}")

with open('search_results.txt', 'w', encoding='utf-8') as f:
    f.writelines(results)
