"""Генераторы графов ComfyUI в API-формате ({node_id: {class_type, inputs}}).

Три бэкенда:
  * klein_graph        — FLUX.2 [klein] 4B локально: text-to-image и image-edit с референсами
                         (ReferenceLatent, как в официальном шаблоне image_flux2_klein_image_edit_4b_base).
  * flux_graph         — FLUX.2 [dev] на удалённом ComfyUI (RunPod): та же схема, но без negative —
                         FluxGuidance + BasicGuider, как в официальном шаблоне image_flux2_dev.
  * comfy_gemini_graph — Nano Banana через API-ноду ComfyUI (GeminiImage2Node), как в шаблонах
                         pipeline/workflows/ui/*.json.

`python pipeline/workflows/build_workflows.py` — сохраняет примеры в pipeline/workflows/api/
(их можно перетащить в ComfyUI: Load → выбрать .json; API-формат он тоже понимает).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

Graph = dict[str, dict[str, Any]]


class _G:
    """Крошечный билдер: g.add('ClassType', **inputs) -> ссылка [id, 0]."""

    def __init__(self) -> None:
        self.nodes: Graph = {}
        self._n = 0

    def add(self, class_type: str, title: str | None = None, **inputs: Any) -> list:
        self._n += 1
        nid = str(self._n)
        node: dict[str, Any] = {"class_type": class_type, "inputs": inputs}
        if title:
            node["_meta"] = {"title": title}
        self.nodes[nid] = node
        return [nid, 0]


def klein_graph(
    cfg: dict,
    prompt: str,
    negative: str = "",
    refs: list[str] | None = None,
    width: int | None = None,
    height: int | None = None,
    seed: int = 0,
    filename_prefix: str = "bgame/klein",
) -> Graph:
    """FLUX.2 klein: refs — имена файлов уже загруженных в ComfyUI/input (см. ComfyClient.upload_image)."""
    refs = refs or []
    width = width or int(cfg["width"])
    height = height or int(cfg["height"])
    distilled = bool(cfg.get("distilled"))
    steps = 4 if distilled else int(cfg["steps"])
    guidance = 1.0 if distilled else float(cfg["cfg"])

    g = _G()
    unet = str(cfg["unet"])
    if unet.lower().endswith(".gguf"):
        model = g.add("UnetLoaderGGUF", "Klein (GGUF)", unet_name=unet)
    else:
        model = g.add("UNETLoader", "Klein", unet_name=unet, weight_dtype="default")
    if cfg.get("lora"):
        model = g.add(
            "LoraLoaderModelOnly",
            "LoRA",
            model=model,
            lora_name=str(cfg["lora"]),
            strength_model=float(cfg.get("lora_strength", 1.0)),
        )
    clip = g.add("CLIPLoader", "Qwen3 text encoder", clip_name=str(cfg["clip"]), type="flux2", device="default")
    vae = g.add("VAELoader", "FLUX.2 VAE", vae_name=str(cfg["vae"]))

    pos = g.add("CLIPTextEncode", "Prompt", text=prompt, clip=clip)
    neg = g.add("CLIPTextEncode", "Negative", text=negative, clip=clip)

    # референсы: картинка -> ~1MP -> VAEEncode -> ReferenceLatent (цепочкой и в pos, и в neg)
    for i, name in enumerate(refs):
        img = g.add("LoadImage", f"Ref {i + 1}", image=name)
        scaled = g.add(
            "ImageScaleToTotalPixels",
            None,
            image=img,
            upscale_method="lanczos",
            megapixels=float(cfg.get("ref_megapixels", 1.0)),
            resolution_steps=1,
        )
        lat = g.add("VAEEncode", None, pixels=scaled, vae=vae)
        pos = g.add("ReferenceLatent", None, conditioning=pos, latent=lat)
        neg = g.add("ReferenceLatent", None, conditioning=neg, latent=lat)

    latent = g.add("EmptyFlux2LatentImage", None, width=width, height=height, batch_size=1)
    noise = g.add("RandomNoise", None, noise_seed=int(seed))
    sampler = g.add("KSamplerSelect", None, sampler_name=str(cfg.get("sampler", "euler")))
    sigmas = g.add("Flux2Scheduler", None, steps=steps, width=width, height=height)
    guider = g.add("CFGGuider", None, model=model, positive=pos, negative=neg, cfg=guidance)
    out = g.add(
        "SamplerCustomAdvanced", None, noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=latent
    )
    decoded = g.add("VAEDecode", None, samples=out, vae=vae)
    g.add("SaveImage", None, images=decoded, filename_prefix=filename_prefix)
    return g.nodes


def flux_graph(
    cfg: dict,
    prompt: str,
    refs: list[str] | None = None,
    width: int | None = None,
    height: int | None = None,
    seed: int = 0,
    filename_prefix: str = "bgame/flux",
) -> Graph:
    """FLUX.2 dev: refs — имена файлов уже загруженных в ComfyUI/input. У dev нет negative/CFG:
    CLIPTextEncode → FluxGuidance → ReferenceLatent (цепочкой) → BasicGuider."""
    refs = refs or []
    width = width or int(cfg["width"])
    height = height or int(cfg["height"])

    g = _G()
    model = g.add("UNETLoader", "FLUX.2 dev", unet_name=str(cfg["unet"]), weight_dtype="default")
    if cfg.get("lora"):
        model = g.add(
            "LoraLoaderModelOnly",
            "LoRA",
            model=model,
            lora_name=str(cfg["lora"]),
            strength_model=float(cfg.get("lora_strength", 1.0)),
        )
    clip = g.add("CLIPLoader", "Mistral text encoder", clip_name=str(cfg["clip"]), type="flux2", device="default")
    vae = g.add("VAELoader", "FLUX.2 VAE", vae_name=str(cfg["vae"]))

    cond = g.add("CLIPTextEncode", "Prompt", text=prompt, clip=clip)
    cond = g.add("FluxGuidance", None, conditioning=cond, guidance=float(cfg.get("guidance", 4.0)))
    for i, name in enumerate(refs):
        img = g.add("LoadImage", f"Ref {i + 1}", image=name)
        scaled = g.add(
            "ImageScaleToTotalPixels",
            None,
            image=img,
            upscale_method="area",
            megapixels=float(cfg.get("ref_megapixels", 1.0)),
            resolution_steps=1,
        )
        lat = g.add("VAEEncode", None, pixels=scaled, vae=vae)
        cond = g.add("ReferenceLatent", None, conditioning=cond, latent=lat)

    latent = g.add("EmptyFlux2LatentImage", None, width=width, height=height, batch_size=1)
    noise = g.add("RandomNoise", None, noise_seed=int(seed))
    sampler = g.add("KSamplerSelect", None, sampler_name=str(cfg.get("sampler", "euler")))
    sigmas = g.add("Flux2Scheduler", None, steps=int(cfg.get("steps", 20)), width=width, height=height)
    guider = g.add("BasicGuider", None, model=model, conditioning=cond)
    out = g.add(
        "SamplerCustomAdvanced", None, noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=latent
    )
    decoded = g.add("VAEDecode", None, samples=out, vae=vae)
    g.add("SaveImage", None, images=decoded, filename_prefix=filename_prefix)
    return g.nodes


def comfy_gemini_graph(
    cfg: dict,
    prompt: str,
    refs: list[str] | None = None,
    seed: int = 0,
    filename_prefix: str = "bgame/nano",
    system_prompt: str | None = None,
) -> Graph:
    """Nano Banana через GeminiImage2Node (API-нода ComfyUI; нужен вход в comfy.org)."""
    refs = refs or []
    g = _G()
    inputs: dict[str, Any] = dict(
        prompt=prompt,
        model=str(cfg["model"]),
        seed=int(seed),
        aspect_ratio=str(cfg.get("aspect_ratio", "1:1")),
        resolution=str(cfg.get("resolution", "1K")),
        response_modalities="IMAGE",
    )
    if system_prompt:
        inputs["system_prompt"] = system_prompt
    if refs:
        loaded = [g.add("LoadImage", f"Ref {i + 1}", image=name) for i, name in enumerate(refs)]
        if len(loaded) == 1:
            inputs["images"] = loaded[0]
        else:
            # ImageBatch подгоняет второй кадр под размер первого (bilinear, center-crop):
            # референсы для nano banana лучше давать одного размера.
            batch = loaded[0]
            for extra in loaded[1:]:
                batch = g.add("ImageBatch", None, image1=batch, image2=extra)
            inputs["images"] = batch
    img = g.add("GeminiImage2Node", "Nano Banana", **inputs)
    g.add("SaveImage", None, images=img, filename_prefix=filename_prefix)
    return g.nodes


def _example_cfg() -> dict:
    import yaml

    root = Path(__file__).resolve().parents[2]
    return yaml.safe_load((root / "pipeline" / "config.yaml").read_text(encoding="utf-8"))


if __name__ == "__main__":
    cfg = _example_cfg()
    out = Path(__file__).resolve().parent / "api"
    out.mkdir(exist_ok=True)
    examples = {
        "klein_t2i.json": klein_graph(cfg["klein"], "pixel art sprite of a small brown dog, magenta background", seed=1),
        "klein_edit_1ref.json": klein_graph(
            cfg["klein"], "same character, walking right, 4 frames in a 2x2 grid", refs=["bgame/girl_ref.png"], seed=1
        ),
        "klein_edit_2ref.json": klein_graph(
            cfg["klein"], "reskin image 1 in the pixel art style of image 2", refs=["bgame/a.png", "bgame/b.png"], seed=1
        ),
        "flux_t2i.json": flux_graph(cfg["flux"], "pixel art sprite of a small brown dog, magenta background", seed=1),
        "flux_edit_1ref.json": flux_graph(
            cfg["flux"], "same character, walking right, 4 frames in a 2x2 grid", refs=["bgame/girl_ref.png"], seed=1
        ),
        "nano_1ref.json": comfy_gemini_graph(cfg["comfy_gemini"], "pixel art walk cycle", refs=["bgame/girl_ref.png"]),
    }
    for name, graph in examples.items():
        (out / name).write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
        print("wrote", out / name)
