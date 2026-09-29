import json, os, http.client, urllib.request, sys

OWNER, REPO = "Radiosky-bilibili", "yichang-3d"
TAG = "v1.3-preview"
NAME = "v1.3 preview — 4x terrain data · idle auto-tour · volumetric clouds (work in progress)"
ASSET = "index_v13.html"
ASSET_NAME = "yichang-3d-v1.3-preview.html"
NOTES = "release_v13_notes.md"
tok = os.environ.get("GITHUB_TOKEN", "")
if not tok:
    sys.exit("缺少 $GITHUB_TOKEN")

body = open(NOTES, encoding="utf-8").read()
hdr = {"Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json",
       "User-Agent": "minis-release", "Content-Type": "application/json"}

def api(method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, headers=hdr, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

st, rel = api("GET", f"https://api.github.com/repos/{OWNER}/{REPO}/releases/tags/{TAG}")
if st == 200:
    print("release 已存在，复用:", rel["html_url"])
else:
    st, rel = api("POST", f"https://api.github.com/repos/{OWNER}/{REPO}/releases", {
        "tag_name": TAG, "target_commitish": "main", "name": NAME,
        "body": body, "draft": False, "prerelease": True})
    if st not in (200, 201):
        sys.exit("创建 release 失败 %s %s" % (st, rel))
    print("已创建 release:", rel["html_url"], "| prerelease =", rel["prerelease"])

size = os.path.getsize(ASSET)
exists = [a for a in rel.get("assets", []) if a["name"] == ASSET_NAME]
if exists and exists[0].get("size") == size:
    print("附件已存在且大小一致，跳过上传")
else:
    if exists:
        api("DELETE", f"https://api.github.com/repos/{OWNER}/{REPO}/releases/assets/{exists[0]['id']}")
    up = "/repos/%s/%s/releases/%s/assets?name=%s" % (OWNER, REPO, rel["id"], ASSET_NAME)
    conn = http.client.HTTPSConnection("uploads.github.com", timeout=900)
    conn.putrequest("POST", up)
    conn.putheader("Authorization", "Bearer " + tok)
    conn.putheader("User-Agent", "minis-release")
    conn.putheader("Content-Type", "text/html")
    conn.putheader("Content-Length", str(size))
    conn.endheaders()
    with open(ASSET, "rb") as f:
        left = size
        while left:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            conn.send(chunk)
            left -= len(chunk)
    r = conn.getresponse()
    out = json.loads(r.read().decode() or "{}")
    print("上传返回", r.status, "state =", out.get("state"), "size =", out.get("size"))
conn.close()
st, rel = api("GET", f"https://api.github.com/repos/{OWNER}/{REPO}/releases/tags/{TAG}")
for a in rel.get("assets", []):
    print("最终附件:", a["name"], a["size"], a["state"], a["browser_download_url"])
print("prerelease =", rel["prerelease"], "| 页面:", rel["html_url"])
