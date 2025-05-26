# generate_list_script.py
import os
import json
from bs4 import BeautifulSoup

# REPO_BASE_PATHの決定
# GitHub Actions環境では GITHUB_REPOSITORY (例: kiyo4act/Tools) が自動で設定される
# これを利用して /Tools のようなパスを生成する
github_repo_env = os.environ.get('GITHUB_REPOSITORY')
if github_repo_env:
    # GITHUB_REPOSITORY は 'owner/repo_name' の形式なので、'repo_name'部分を取得
    REPO_BASE_PATH = "/" + github_repo_env.split('/')[-1]
else:
    # ローカルでテストする場合など、環境変数がなければデフォルト値 (適宜ご自身の環境に合わせてください)
    REPO_BASE_PATH = "/Tools" # 例: kiyo.link/Tools/ の 'Tools' 部分

def get_html_metadata(html_file_path):
    """指定されたHTMLファイルからメタデータを抽出する"""
    metadata = {
        "name": None,
        "description": None,
        "lastUpdated": None
    }
    try:
        with open(html_file_path, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f, 'html.parser')

            title_tag = soup.find('title')
            if title_tag and title_tag.string:
                metadata["name"] = title_tag.string.strip()

            description_meta = soup.find('meta', attrs={'name': 'description'})
            if description_meta and description_meta.get('content'):
                metadata["description"] = description_meta['content'].strip()

            last_updated_meta = soup.find('meta', attrs={'name': 'last-updated'})
            if last_updated_meta and last_updated_meta.get('content'):
                metadata["lastUpdated"] = last_updated_meta['content'].strip()
            
            # もし<meta name="last-updated">がない場合、ファイルの最終更新日時を使用する例 (オプション)
            # if not metadata["lastUpdated"]:
            #     try:
            #         from datetime import datetime
            #         timestamp = os.path.getmtime(html_file_path)
            #         metadata["lastUpdated"] = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d')
            #     except OSError:
            #         pass

    except FileNotFoundError:
        print(f"Warning: HTML file not found at {html_file_path}")
    except Exception as e:
        print(f"Error parsing HTML file {html_file_path}: {e}")
    return metadata

def main():
    print(f"Using REPO_BASE_PATH: {REPO_BASE_PATH}")
    tools_data = []
    
    # Toolsリポジトリのルートディレクトリからサブディレクトリを探索
    # (GitHub Actionsのワークスペースのルートで実行される想定)
    for item_name in os.listdir("."):
        item_full_path = os.path.join(".", item_name)
        # 隠しフォルダ、GitHub Actions関連フォルダ、スクリプト自身などは除外
        if os.path.isdir(item_full_path) and \
           not item_name.startswith('.') and \
           item_name not in ['docs', '.github', 'node_modules']: # その他除外したいフォルダがあれば追加

            html_file_path = os.path.join(item_full_path, "index.html")
            
            if os.path.exists(html_file_path):
                print(f"Processing tool in folder: {item_name}")
                metadata = get_html_metadata(html_file_path)
                
                tool_name = metadata["name"] if metadata["name"] else item_name # titleがなければフォルダ名

                tool_entry = {
                    "name": tool_name,
                    "path": item_name, # フォルダ名
                    "url": f"{REPO_BASE_PATH.rstrip('/')}/{item_name}/", # 例: /Tools/LyricPrinter/
                    "description": metadata["description"],
                    "lastUpdated": metadata["lastUpdated"]
                }
                tools_data.append(tool_entry)
            else:
                print(f"Skipping folder {item_name}: index.html not found at {html_file_path}")
    
    # フォルダ名(path)でソートする (任意ですが、一貫性のため推奨)
    tools_data.sort(key=lambda x: x['path'].lower())

    output_file = "tools-list.json"
    with open(output_file, "w", encoding='utf-8') as f:
        json.dump(tools_data, f, indent=2, ensure_ascii=False)
    print(f"Successfully generated {output_file} with {len(tools_data)} tools.")

if __name__ == "__main__":
    main()
