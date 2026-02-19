"""Deeper inspection — probe specific elements we need for automation."""

import asyncio
from playwright.async_api import async_playwright
from pathlib import Path


async def inspect():
    pw = await async_playwright().start()
    user_data = Path.home() / ".smi-browser"

    ctx = await pw.chromium.launch_persistent_context(
        user_data_dir=str(user_data),
        headless=False,
        viewport={"width": 1280, "height": 900},
        args=["--disable-blink-features=AutomationControlled"],
    )

    # ── GROK: Inspect the prompt area and submit flow ──
    page = await ctx.new_page()
    await page.goto("https://grok.com/imagine", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    print("=== GROK DEEP INSPECT ===")

    # The tiptap/ProseMirror contenteditable
    ce = await page.query_selector('[contenteditable="true"]')
    if ce:
        cls = await ce.evaluate("e => e.className")
        parent_cls = await ce.evaluate("e => e.parentElement.className")
        print(f"  ContentEditable class: {cls}")
        print(f"  Parent class: {parent_cls}")

    # The submit button
    submit = await page.query_selector('button[aria-label="Submit"]')
    if submit:
        print(f"  Submit button found: aria-label='Submit'")

    # Look for aspect ratio / image type controls
    # The "Image" dropdown visible in screenshot
    image_btn = await page.query_selector('button:has-text("Image")')
    if image_btn:
        print(f"  'Image' button found — clicking to see options...")
        await image_btn.click()
        await asyncio.sleep(1)
        await page.screenshot(path="screenshot_grok_dropdown.png")
        # Check what appeared
        options = await page.query_selector_all('[role="option"], [role="menuitem"], li, [role="listbox"] > *')
        for opt in options[:10]:
            text = await opt.evaluate("e => e.innerText")
            print(f"    Option: {text}")
        # Close the dropdown
        await page.keyboard.press("Escape")

    # Look for any aspect ratio buttons
    for ratio in ["1:1", "16:9", "9:16", "4:3", "3:4"]:
        btn = await page.query_selector(f'button:has-text("{ratio}")')
        if btn:
            print(f"  Aspect ratio button found: {ratio}")

    # After generation — what does a result image look like?
    # Check existing gallery images
    imgs = await page.query_selector_all("img")
    print(f"\n  Total img elements: {len(imgs)}")
    for i, img in enumerate(imgs[:5]):
        src = await img.get_attribute("src") or ""
        alt = await img.get_attribute("alt") or ""
        cls = await img.evaluate("e => e.className")
        box = await img.bounding_box()
        w = box["width"] if box else 0
        h = box["height"] if box else 0
        print(f"  img[{i}]: {w}x{h} class='{cls[:60]}' alt='{alt[:40]}' src='{src[:80]}'")

    # ── SORA: Inspect the prompt area and navigation ──
    page2 = await ctx.new_page()
    await page2.goto("https://sora.chatgpt.com/storyboard", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    print("\n=== SORA DEEP INSPECT ===")
    print(f"  Final URL: {page2.url}")

    # The textarea
    ta = await page2.query_selector("textarea")
    if ta:
        placeholder = await ta.get_attribute("placeholder") or ""
        cls = await ta.evaluate("e => e.className")
        print(f"  Textarea found: placeholder='{placeholder}' class='{cls[:60]}'")

    # Submit button — look for the arrow button next to textarea
    all_buttons = await page2.query_selector_all("button")
    print(f"  Total buttons: {len(all_buttons)}")
    for btn in all_buttons:
        text = await btn.evaluate("e => (e.innerText || '').trim()")
        aria = await btn.get_attribute("aria-label") or ""
        cls = await btn.evaluate("e => e.className.slice(0, 60)")
        if text or aria:
            print(f"    button: text='{text[:40]}' aria='{aria}' class='{cls}'")

    # Check for the storyboard button
    sb_btn = await page2.query_selector('button:has-text("Storyboard")')
    if sb_btn:
        print(f"  'Storyboard' button found")

    # Check left sidebar nav items
    nav_links = await page2.query_selector_all("a, nav button, [role='navigation'] *")
    for link in nav_links[:10]:
        text = await link.evaluate("e => (e.innerText || e.title || e.getAttribute('aria-label') || '').trim()")
        href = await link.get_attribute("href") or ""
        if text or href:
            print(f"  nav: text='{text[:40]}' href='{href}'")

    # Now check the drafts page
    print("\n  Navigating to /drafts...")
    await page2.goto("https://sora.chatgpt.com/drafts", wait_until="domcontentloaded")
    await asyncio.sleep(5)
    print(f"  Drafts URL: {page2.url}")
    await page2.screenshot(path="screenshot_sora_drafts.png")

    # Check what's on the drafts page
    all_elements = await page2.query_selector_all("a, button, video, img")
    print(f"  Elements on drafts: {len(all_elements)}")
    for el in all_elements[:15]:
        tag = await el.evaluate("e => e.tagName")
        text = await el.evaluate("e => (e.innerText || e.alt || e.title || '').trim().slice(0, 50)")
        href = await el.get_attribute("href") or ""
        cls = await el.evaluate("e => e.className.slice(0, 50)")
        if text or href:
            print(f"    <{tag}> text='{text}' href='{href[:60]}' class='{cls}'")

    print("\nBrowser stays open 45 seconds...")
    await asyncio.sleep(45)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(inspect())
