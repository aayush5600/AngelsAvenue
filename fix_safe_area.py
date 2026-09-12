import os
import glob

files = glob.glob("/Users/jeevan/Documents/Angel's Avenue/App/Angel's Avenue/src/app/*.tsx")

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    if "SafeAreaView" in content and "react-native-safe-area-context" not in content:
        # Replace occurrences in react-native import
        content = content.replace(" SafeAreaView, ", " ")
        content = content.replace(", SafeAreaView", "")
        content = content.replace("SafeAreaView, ", "")
        
        # Insert the new import
        import_stmt = "from 'react-native';"
        if import_stmt in content:
            content = content.replace(import_stmt, "from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context';", 1)
        
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {os.path.basename(filepath)}")

