import re

files = ["src/app/stock.tsx", "src/app/admin-stock.tsx"]

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    # Swap the extraction
    content = content.replace(
        "const purchaseQty = item.qty || 0;",
        "const purchaseQty = item.price || 0;"
    )
    content = content.replace(
        "const purchasePrice = item.price || 0;",
        "const purchasePrice = item.qty || 0;"
    )

    with open(file, 'w') as f:
        f.write(content)

print("Data swapped.")
