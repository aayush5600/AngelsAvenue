import json
import os
import re

transcript_path = "/Users/jeevan/.gemini/antigravity-ide/brain/8fea33e5-7852-4441-8942-7ae92edc96b9/.system_generated/logs/transcript_full.jsonl"
app_path = "/Users/jeevan/Documents/Angel's Avenue/App/Angel's Avenue/src/app"

file_contents = {}

with open(transcript_path, "r") as f:
    for line in f:
        try:
            entry = json.loads(line)
            if entry.get("type") == "VIEW_FILE" and entry.get("status") == "DONE":
                content = entry.get("content", "")
                if "File Path: " in content and "The following code has been modified" in content:
                    lines = content.split("\n")
                    file_path = ""
                    code_lines = []
                    is_code = False
                    
                    for l in lines:
                        if l.startswith("File Path: "):
                            file_path = l.split("`")[1].replace("%20", " ")
                        elif "The following code has been modified" in l:
                            is_code = True
                        elif is_code and l.startswith("The above content does NOT show"):
                            is_code = False
                        elif is_code and l.startswith("The above content shows the entire"):
                            is_code = False
                        elif is_code:
                            # Strip line number: "1: import ..." -> "import ..."
                            match = re.match(r'^\d+:\s?(.*)', l)
                            if match:
                                code_lines.append(match.group(1))
                            elif l == "":
                                code_lines.append("")
                            
                    if file_path.startswith("file://" + app_path):
                        filename = os.path.basename(file_path)
                        if filename not in file_contents:
                            file_contents[filename] = []
                        file_contents[filename].extend(code_lines)
        except Exception as e:
            pass

for filename, lines in file_contents.items():
    out_path = os.path.join(app_path, filename)
    print(f"Recovering {filename} ({len(lines)} lines)")
    with open(out_path, "w") as f:
        f.write("\n".join(lines) + "\n")
