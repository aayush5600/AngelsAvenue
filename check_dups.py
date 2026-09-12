import re

with open("src/app/add-stock.tsx", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "dateText:" in line:
        print(f"dateText at line {i+1}: {line.strip()}")
