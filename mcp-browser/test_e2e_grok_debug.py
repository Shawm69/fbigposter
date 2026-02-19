"""Debug: step through the Grok generation with screenshots at each step."""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright


async def test():
    pw = await async_playwright().start()
    user_data = Path.home() / ".smi-browser"

    ctx = await pw.chromium.launch_persistent_context(
        user_data_dir=str(user_data),
        headless=False,
        viewport={"width": 1280, "height": 900},
        args=["--disable-blink-features=AutomationControlled"],
    )

    page = await ctx.new_page()
    await page.goto("https://grok.com/imagine", wait_until="domcontentloaded")
    await asyncio.sleep(5)
    print(f"Page URL: {page.url}")

    # Step 1: Find editor
    editor = await page.query_selector('[contenteditable="true"]')
    print(f"Editor found: {editor is not None}")
    if not editor:
        print("Trying alternative selectors...")
        for sel in ['textarea', '.ProseMirror', '.tiptap', '[role="textbox"]']:
            el = await page.query_selector(sel)
            print(f"  {sel}: {el is not None}")
        await page.screenshot(path="debug_step1.png")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    # Step 2: Count initial images
    initial = await page.query_selector_all('img[alt="Generated image"]')
    print(f"Initial images: {len(initial)}")

    # Step 3: Click and type
    await editor.click()
    await asyncio.sleep(0.3)
    await page.keyboard.press("Control+a")
    await page.keyboard.press("Backspace")
    await asyncio.sleep(0.3)

    prompt = "a cute baby seal on a beach at sunset"
    await page.keyboard.type(prompt, delay=20)
    await asyncio.sleep(1)

    # Verify text was entered
    text_content = await editor.evaluate("e => e.textContent")
    print(f"Editor text after typing: '{text_content[:60]}'")
    await page.screenshot(path="debug_step2_typed.png")

    # Step 4: Click submit
    submit = await page.query_selector('button[aria-label="Submit"]')
    print(f"Submit button found: {submit is not None}")
    if submit:
        is_disabled = await submit.is_disabled()
        print(f"Submit disabled: {is_disabled}")
        await submit.click()
        print("Clicked submit")
    else:
        print("No submit button! Taking screenshot...")
        await page.screenshot(path="debug_no_submit.png")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    # Step 5: Poll for results
    await asyncio.sleep(2)
    await page.screenshot(path="debug_step3_after_submit.png")

    for i in range(20):
        await asyncio.sleep(3)
        current = await page.query_selector_all('img[alt="Generated image"]')
        print(f"  Poll {i+1}: {len(current)} images (initial: {len(initial)})")
        if len(current) > len(initial):
            print("SUCCESS: New images appeared!")
            new_img = current[len(initial)]
            src = await new_img.get_attribute("src") or ""
            print(f"  src type: {'base64' if src.startswith('data:') else 'url' if src.startswith('http') else 'unknown'}")
            print(f"  src length: {len(src)}")
            await page.screenshot(path="debug_step4_result.png")
            break
    else:
        print("No new images after polling.")
        await page.screenshot(path="debug_step4_timeout.png")

    print("\nDone. Browser stays open 20 seconds...")
    await asyncio.sleep(20)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
