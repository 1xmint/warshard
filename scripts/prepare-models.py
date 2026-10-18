"""Keep only gameplay animations and their live glTF buffers. No third-party tools.
Run: python scripts/prepare-models.py client/public/assets/kaykit
Input provenance and CC0 license live alongside the models. Re-running is safe.
"""
import json
import struct
import sys
from pathlib import Path

CLIPS = {"Idle", "Running_A", "Spellcasting", "Spellcast_Long", "Spellcast_Shoot",
         "Hit_A", "Death_A", "1H_Melee_Attack_Slice_Diagonal", "Blocking"}

for file in Path(sys.argv[1]).glob("*.glb"):
    raw = file.read_bytes()
    magic, version, _ = struct.unpack_from("<III", raw)
    assert magic == 0x46546C67 and version == 2
    size, _ = struct.unpack_from("<II", raw, 12)
    data = json.loads(raw[20:20 + size])
    binary = raw[28 + size:]
    data["animations"] = [a for a in data.get("animations", []) if a.get("name") in CLIPS]
    references = []
    for mesh in data["meshes"]:
        for primitive in mesh["primitives"]:
            references.extend((primitive["attributes"], key) for key in primitive["attributes"])
            if "indices" in primitive:
                references.append((primitive, "indices"))
            for target in primitive.get("targets", []):
                references.extend((target, key) for key in target)
    references.extend((skin, "inverseBindMatrices") for skin in data.get("skins", []) if "inverseBindMatrices" in skin)
    for animation in data["animations"]:
        for sampler in animation["samplers"]:
            references.extend([(sampler, "input"), (sampler, "output")])
    used = sorted({parent[key] for parent, key in references})
    remap = {old: new for new, old in enumerate(used)}
    for parent, key in references:
        parent[key] = remap[parent[key]]
    data["accessors"] = [data["accessors"][i] for i in used]
    views = [(a, "bufferView") for a in data["accessors"] if "bufferView" in a]
    assert all("sparse" not in a for a in data["accessors"])
    views.extend((image, "bufferView") for image in data.get("images", []) if "bufferView" in image)
    used_views = sorted({parent[key] for parent, key in views})
    remap = {old: new for new, old in enumerate(used_views)}
    for parent, key in views:
        parent[key] = remap[parent[key]]
    output = bytearray()
    kept = []
    for index in used_views:
        view = data["bufferViews"][index].copy()
        assert view["buffer"] == 0
        start = view.get("byteOffset", 0)
        output.extend(b"\0" * (-len(output) % 4))
        view["byteOffset"] = len(output)
        output.extend(binary[start:start + view["byteLength"]])
        kept.append(view)
    data["bufferViews"] = kept
    data["buffers"] = [{"byteLength": len(output)}]
    output.extend(b"\0" * (-len(output) % 4))
    encoded = json.dumps(data, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    result = struct.pack("<III", magic, 2, 28 + len(encoded) + len(output))
    result += struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
    result += struct.pack("<II", len(output), 0x004E4942) + output
    file.write_bytes(result)
    print(f"{file.name}: {len(raw)} -> {len(result)} bytes; {len(data['animations'])} gameplay clips")
