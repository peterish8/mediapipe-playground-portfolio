const interactiveSelector = ".btn, .tab, .model-option, .swatch, .showcase-card, .back-link";

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest(interactiveSelector) : null;
  if (!target || target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;

  const rect = target.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "ui-ripple";
  ripple.style.left = `${event.clientX ? event.clientX - rect.left : rect.width / 2}px`;
  ripple.style.top = `${event.clientY ? event.clientY - rect.top : rect.height / 2}px`;
  target.append(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
});
