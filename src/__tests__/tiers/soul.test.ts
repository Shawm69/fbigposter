import { getNestedValue, setNestedValue } from "../../tiers/soul";

describe("getNestedValue", () => {
  it("gets a top-level property", () => {
    expect(getNestedValue({ name: "Alice" }, "name")).toBe("Alice");
  });

  it("gets a deeply nested property via dot-path", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getNestedValue(obj, "a.b.c")).toBe(42);
  });

  it("returns undefined for a missing path", () => {
    expect(getNestedValue({ a: 1 }, "b.c.d")).toBeUndefined();
  });

  it("handles an empty object", () => {
    expect(getNestedValue({}, "a.b")).toBeUndefined();
  });

  it("returns the full object at a mid-level path", () => {
    const obj = { a: { b: { c: 1 } } };
    expect(getNestedValue(obj, "a.b")).toEqual({ c: 1 });
  });
});

describe("setNestedValue", () => {
  it("sets a top-level property", () => {
    const obj: any = {};
    setNestedValue(obj, "name", "Bob");
    expect(obj.name).toBe("Bob");
  });

  it("sets a deeply nested property, creating intermediates", () => {
    const obj: any = {};
    setNestedValue(obj, "a.b.c", 99);
    expect(obj.a.b.c).toBe(99);
  });

  it("overwrites an existing value", () => {
    const obj: any = { a: { b: 10 } };
    setNestedValue(obj, "a.b", 20);
    expect(obj.a.b).toBe(20);
  });

  it("creates intermediate objects without clobbering siblings", () => {
    const obj: any = { a: { x: 1 } };
    setNestedValue(obj, "a.y", 2);
    expect(obj.a.x).toBe(1);
    expect(obj.a.y).toBe(2);
  });
});
