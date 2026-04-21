export const HERO_ANIMATION_STYLES = `
  @keyframes heroFadeIn {
    from { opacity: 0 }
    to { opacity: 1 }
  }
  @keyframes heroSlideIn {
    from { opacity: 0; transform: translateX(-8px) }
    to { opacity: 1; transform: translateX(0) }
  }
  @keyframes heroGrowY {
    from { transform: scaleY(0) }
    to { transform: scaleY(1) }
  }
  @keyframes heroGrowX {
    from { transform: scaleX(0) }
    to { transform: scaleX(1) }
  }
  @keyframes heroScaleIn {
    from { opacity: 0; transform: scale(0.88) }
    to { opacity: 1; transform: scale(1) }
  }
  @keyframes heroDropCap {
    from { opacity: 0; transform: scale(0.4) }
    to { opacity: 1; transform: scale(1) }
  }
  .hero-page { opacity: 0; animation: heroFadeIn 1s ease-out forwards }
  .hero-grid { opacity: 0; animation: heroFadeIn 0.8s ease-out 0.2s forwards }
  .hero-margins { opacity: 0; animation: heroFadeIn 0.6s ease-out 0.5s forwards }
  .hero-title { opacity: 0; animation: heroSlideIn 0.5s ease-out 0.8s forwards }
  .hero-subtitle { opacity: 0; animation: heroSlideIn 0.4s ease-out 1.0s forwards }
  .hero-sep { transform-origin: left center; transform: scaleX(0); animation: heroGrowX 0.5s ease-out 1.1s forwards }
  .hero-colrule { transform-origin: center top; transform: scaleY(0); animation: heroGrowY 0.6s ease-out 1.2s forwards }
  .hero-dropcap { opacity: 0; transform-origin: center; animation: heroDropCap 0.4s ease-out 1.4s forwards }
  .hero-ll { opacity: 0; animation: heroSlideIn 0.3s ease-out forwards }
  .hero-rl { opacity: 0; animation: heroSlideIn 0.3s ease-out forwards }
  .hero-rhead { opacity: 0; animation: heroSlideIn 0.35s ease-out 1.5s forwards }
  .hero-quote { opacity: 0; animation: heroFadeIn 0.5s ease-out forwards }
  .hero-quoteline { opacity: 0; animation: heroSlideIn 0.3s ease-out forwards }
  .hero-figure { opacity: 0; transform-origin: center; animation: heroScaleIn 0.5s ease-out forwards }
  .hero-footer { opacity: 0; animation: heroFadeIn 0.4s ease-out 3.6s forwards }
`;
