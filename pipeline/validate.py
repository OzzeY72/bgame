"""Проверка графов ComfyUI против живого сервера (/object_info): существуют ли ноды, входы, модели.

    python pipeline/validate.py                 # klein- и comfy-gemini-графы против comfy.url
    python pipeline/validate.py --flux          # flux-граф против flux.url (RunPod)
    python pipeline/validate.py path/to/graph.json ...
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

# Windows-консоль по умолчанию cp1252 — иначе русские сообщения падают с UnicodeEncodeError
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from comfy_client import ComfyClient  # noqa: E402
from workflows.build_workflows import comfy_gemini_graph, flux_graph, klein_graph  # noqa: E402


def validate(graph: dict, info: dict) -> list[str]:
    problems: list[str] = []
    for nid, node in graph.items():
        ct = node["class_type"]
        spec = info.get(ct)
        if not spec:
            problems.append(f"#{nid}: ноды {ct} нет на сервере (custom node не установлен?)")
            continue
        req = spec["input"].get("required", {})
        opt = spec["input"].get("optional", {})
        for name in req:
            if name not in node["inputs"]:
                problems.append(f"#{nid} {ct}: нет обязательного входа {name}")
        for name, val in node["inputs"].items():
            if name not in req and name not in opt:
                problems.append(f"#{nid} {ct}: лишний вход {name}")
                continue
            typ = (req.get(name) or opt.get(name))[0]
            if isinstance(typ, list) and not isinstance(val, list):
                if typ and val not in typ:
                    problems.append(f"#{nid} {ct}.{name}: '{val}' нет среди вариантов (первые: {typ[:5]})")
            if isinstance(val, list) and len(val) == 2 and str(val[0]) in graph:
                src = graph[str(val[0])]["class_type"]
                outs = info.get(src, {}).get("output", [])
                if outs and val[1] >= len(outs):
                    problems.append(f"#{nid} {ct}.{name}: у {src} нет выхода {val[1]}")
                elif outs and isinstance(typ, str) and outs[val[1]] != typ and typ != "*":
                    problems.append(f"#{nid} {ct}.{name}: ждёт {typ}, а {src} даёт {outs[val[1]]}")
    return problems


def main() -> None:
    import os

    cfg = yaml.safe_load((HERE / "config.yaml").read_text(encoding="utf-8"))
    args = [a for a in sys.argv[1:] if a != "--flux"]
    flux = "--flux" in sys.argv
    url = (os.environ.get("FLUX_COMFY_URL") or cfg["flux"].get("url") or cfg["comfy"]["url"]) if flux else cfg["comfy"]["url"]
    print("ComfyUI:", url)
    client = ComfyClient(url)
    info = client.object_info()
    graphs: dict[str, dict] = {}
    for p in args:
        graphs[p] = json.loads(Path(p).read_text(encoding="utf-8"))
    if not graphs and flux:
        graphs["flux (config.yaml)"] = flux_graph(cfg["flux"], "test", refs=["x.png"], seed=1)
    elif not graphs:
        graphs["klein (config.yaml)"] = klein_graph(cfg["klein"], "test", refs=["x.png"], seed=1)
        graphs["comfy-gemini (config.yaml)"] = comfy_gemini_graph(cfg["comfy_gemini"], "test", refs=["x.png"])
    ok = True
    for name, g in graphs.items():
        probs = validate(g, info)
        # имя LoadImage-файла и модели проверяем отдельно: список файлов на сервере может меняться
        probs = [p for p in probs if not p.startswith("#") or "LoadImage.image" not in p]
        print(f"== {name}: {'OK' if not probs else str(len(probs)) + ' проблем'}")
        for p in probs:
            print("   -", p)
        ok = ok and not probs
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
