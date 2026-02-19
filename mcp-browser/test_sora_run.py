"""Test: run sora.py's generate_sora_video directly."""

import asyncio
from sora import generate_sora_video

async def main():
    result = await generate_sora_video(
        prompt="a baby panda eating bamboo in a zen garden with cherry blossoms falling gently",
        output_path="test_output/panda_video.mp4",
        duration=25,
        aspect_ratio="9:16",
    )
    print(f"\nResult: {result}")

if __name__ == "__main__":
    asyncio.run(main())
