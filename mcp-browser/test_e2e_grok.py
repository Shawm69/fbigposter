"""End-to-end test: generate an image via Grok and save to disk."""

import asyncio
import sys
from pathlib import Path

# Add current dir to path so imports work
sys.path.insert(0, str(Path(__file__).parent))

from grok import generate_grok_image


async def test():
    output_dir = Path(__file__).parent / "test_output"
    output_dir.mkdir(exist_ok=True)
    output_path = str(output_dir / "test_grok.png")

    print("Generating image via Grok Imagine...")
    result = await generate_grok_image(
        prompt="a cute corgi puppy sitting in a field of sunflowers, photorealistic",
        output_path=output_path,
    )

    print(f"\nResult: {result}")

    if result["success"]:
        size = Path(output_path).stat().st_size
        print(f"Image saved to: {output_path}")
        print(f"File size: {size:,} bytes")
        print(f"Generation time: {result['generation_time_ms']}ms")
    else:
        print(f"FAILED: {result.get('error')}")


if __name__ == "__main__":
    asyncio.run(test())
