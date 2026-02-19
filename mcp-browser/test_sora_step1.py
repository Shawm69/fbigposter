"""Sora Step 1: Navigate to storyboard, type prompt, set params, click Create."""

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
    print("Opening sora.chatgpt.com/storyboard...")
    await page.goto("https://sora.chatgpt.com/storyboard", wait_until="domcontentloaded")
    await asyncio.sleep(5)
    print(f"URL: {page.url}")

    if "login" in page.url:
        print("NOT LOGGED IN — need to log in first")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    await page.screenshot(path="sora_step1_loaded.png")

    # Find textarea
    textarea = await page.query_selector("textarea")
    print(f"Textarea found: {textarea is not None}")
    if textarea:
        placeholder = await textarea.get_attribute("placeholder") or ""
        print(f"Placeholder: '{placeholder}'")

    # Type a prompt
    if textarea:
        await textarea.click()
        await textarea.fill("a baby panda eating bamboo in a zen garden with cherry blossoms falling")
        await asyncio.sleep(1)
        print("Prompt typed")

    await page.screenshot(path="sora_step1_typed.png")

    # Check for aspect ratio and duration buttons
    for label in ["Portrait", "Landscape", "Square", "5s", "10s", "15s", "20s"]:
        btn = await page.query_selector(f'button:has-text("{label}")')
        if btn:
            is_pressed = await btn.evaluate("e => e.getAttribute('aria-pressed') || e.getAttribute('data-state') || ''")
            print(f"  Button '{label}' found (state: {is_pressed})")

    # Click Portrait (9:16 for reels)
    portrait_btn = await page.query_selector('button:has-text("Portrait")')
    if portrait_btn:
        await portrait_btn.click()
        await asyncio.sleep(0.5)
        print("Clicked Portrait")

    # Click 10s duration
    dur_btn = await page.query_selector('button:has-text("10s")')
    if dur_btn:
        await dur_btn.click()
        await asyncio.sleep(0.5)
        print("Clicked 10s")

    await page.screenshot(path="sora_step1_params_set.png")

    # Find the Create button
    create_btn = await page.query_selector('button[aria-label="Create"]')
    if not create_btn:
        create_btn = await page.query_selector('button:has-text("Create")')
    print(f"Create button found: {create_btn is not None}")

    if create_btn:
        text = await create_btn.evaluate("e => e.innerText.trim()")
        disabled = await create_btn.is_disabled()
        print(f"  text='{text}' disabled={disabled}")

    # DON'T click Create yet — just showing what we found
    print("\nStep 1 complete. Everything looks good? Browser stays open 30s...")
    await asyncio.sleep(30)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
