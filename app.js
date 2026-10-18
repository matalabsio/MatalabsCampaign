// ==========================================================================
// MATA LABS PRESENTATION — 3D PAGE ANIMATION ENGINE
// Phone: 3D Physical Page Flip (like a luxury physical lookbook)
// Desktop: 3D Page Lift & Depth Animation (smooth full-page transition)
// ==========================================================================

import { inject } from '@vercel/analytics';
import { slidesData } from './src/data/slides.js';

inject({ mode: import.meta.env.PROD ? 'production' : 'development' });


// ==========================================================================
// CONFIDENTIAL ACCESS GATE & 6-HOUR SESSION CONTROLLER
// One-way SHA-256 hashed password verification.
// No plaintext password exists anywhere in client bundle or source.
// ==========================================================================
const AUTH_SESSION_KEY = 'mata_deck_session_v2';
const SESSION_DURATION_MS = 6 * 60 * 60 * 1000; // 6 Hours

// SHA-256 hash of the presentation access key.
const TARGET_PASS_HASH = "5e20f90a6cc155b3fa6b957cebae0afe60d4c290274ae1815b69a4f0b08b0aa7";

class AuthManager {
  constructor(onSuccess) {
    this.onSuccess = onSuccess;
    this.gateEl = document.getElementById('auth-gate');
    this.formEl = document.getElementById('auth-form');
    this.inputEl = document.getElementById('auth-input');
    this.errorEl = document.getElementById('auth-error');

    this.init();
  }

  init() {
    const visibilityButton = document.getElementById('auth-visibility-btn');
    if (visibilityButton && this.inputEl) {
      visibilityButton.addEventListener('click', () => {
        const showPassword = this.inputEl.type === 'password';
        this.inputEl.type = showPassword ? 'text' : 'password';
        const label = showPassword ? 'Hide password' : 'Show password';
        visibilityButton.setAttribute('aria-label', label);
        visibilityButton.setAttribute('aria-pressed', String(showPassword));
        visibilityButton.title = label;
      });
    }

    if (this.isSessionValid()) {
      if (this.gateEl) {
        this.gateEl.classList.add('is-hidden');
      }
      if (typeof this.onSuccess === 'function') {
        this.onSuccess();
      }
      return;
    }

    if (this.formEl) {
      this.formEl.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  }

  isSessionValid() {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      // Validates authentication, matching password hash, and 6-hour timestamp
      if (data && data.authenticated && data.hash === TARGET_PASS_HASH && data.expiresAt && Date.now() < data.expiresAt) {
        return true;
      }
      localStorage.removeItem(AUTH_SESSION_KEY);
      return false;
    } catch {
      return false;
    }
  }

  saveSession() {
    const session = {
      authenticated: true,
      hash: TARGET_PASS_HASH,
      expiresAt: Date.now() + SESSION_DURATION_MS
    };
    try {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('localStorage not accessible', e);
    }
  }

  // Robust SHA-256 using Web Crypto API with pure JS mathematical fallback
  async hashPassword(str) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (err) {
        console.warn('SubtleCrypto error, falling back to math implementation', err);
      }
    }
    return this.sha256Fallback(str);
  }

  sha256Fallback(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let i, j;
    for (i = 0; i < ascii.length; i++) {
      const code = ascii.charCodeAt(i);
      words[i >> 2] |= (code & 0xff) << (24 - (i % 4) * 8);
    }
    words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
    words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;
    for (i = 0; i < words.length; i += 16) {
      const w = [];
      for (j = 0; j < 64; j++) {
        if (j < 16) {
          w[j] = words[i + j] | 0;
        } else {
          const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
          const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (j = 0; j < 64; j++) {
        const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        const ch = (e & f) ^ ((~e) & g);
        const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
        const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      hash[0] = (hash[0] + a) | 0; hash[1] = (hash[1] + b) | 0; hash[2] = (hash[2] + c) | 0; hash[3] = (hash[3] + d) | 0;
      hash[4] = (hash[4] + e) | 0; hash[5] = (hash[5] + f) | 0; hash[6] = (hash[6] + g) | 0; hash[7] = (hash[7] + h) | 0;
    }
    let result = '';
    for (i = 0; i < 8; i++) {
      for (j = 3; j >= 0; j--) {
        const byte = (hash[i] >> (j * 8)) & 0xff;
        result += byte.toString(16).padStart(2, '0');
      }
    }
    return result;
  }

  async handleSubmit(e) {
    e.preventDefault();
    if (!this.inputEl) return;

    const entered = this.inputEl.value.trim();
    if (!entered) return;

    const hash = await this.hashPassword(entered);

    // Cryptographic match check (zero plaintext password in code)
    if (hash === TARGET_PASS_HASH) {
      this.saveSession();
      if (this.errorEl) this.errorEl.style.display = 'none';
      if (this.gateEl) {
        this.gateEl.classList.add('is-unlocked');
        setTimeout(() => {
          this.gateEl.classList.add('is-hidden');
        }, 650);
      }
      if (typeof this.onSuccess === 'function') {
        this.onSuccess();
      }
    } else {
      this.showError();
    }
  }

  showError() {
    if (this.inputEl) {
      this.inputEl.classList.add('is-error');
      this.inputEl.select();
      setTimeout(() => {
        this.inputEl.classList.remove('is-error');
      }, 500);
    }
    if (this.errorEl) {
      this.errorEl.style.display = 'block';
    }
  }
}

class PresentationDeck {
  constructor() {
    this.slides = slidesData;
    this.deckContainer = document.getElementById('presentation-deck');
    this.currentIndex = 0;
    this.isTransitioning = false;

    this.init();
  }

  init() {
    this.renderSlides();
    this.updateStaticStates(0);
    this.setupDesktopScroll();
    this.setupMobileGestures();
    this.setupKeyboardNavigation();
  }

  renderSlides() {
    if (!this.deckContainer) return;
    this.deckContainer.innerHTML = '';

    this.slides.forEach((slide, idx) => {
      const section = document.createElement('section');
      section.className = `slide-section theme-${slide.bgTheme}`;
      section.id = `slide-${idx}`;
      section.setAttribute('data-slide-index', idx);

      section.setAttribute('role', 'group');
      section.setAttribute('aria-roledescription', 'slide');
      section.setAttribute('aria-label', `${idx + 1} of ${this.slides.length}: ${slide.title}`);

      const image = document.createElement('img');
      image.className = 'slide-image';
      image.src = slide.imagePath;
      image.alt = slide.alt;
      image.width = 1279;
      image.height = 1600;
      image.draggable = false;
      if (idx === 0) image.fetchPriority = 'high';
      const artwork = document.createElement('div');
      artwork.className = 'slide-artwork';
      artwork.appendChild(image);
      for (const link of slide.links || []) {
        const anchor = document.createElement('a');
        anchor.className = 'slide-link';
        anchor.href = link.href;
        anchor.setAttribute('aria-label', link.label);
        anchor.title = link.label;
        if (link.href.startsWith('https://')) {
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
        }
        const [x, y, width, height] = link.bounds;
        anchor.style.left = `${x / 1279 * 100}%`;
        anchor.style.top = `${y / 1600 * 100}%`;
        anchor.style.width = `${width / 1279 * 100}%`;
        anchor.style.height = `${height / 1600 * 100}%`;
        artwork.appendChild(anchor);
      }
      section.appendChild(artwork);
      this.deckContainer.appendChild(section);
    });
  }

  updateStaticStates(activeIndex) {
    if (activeIndex < 0 || activeIndex >= this.slides.length) return;
    this.currentIndex = activeIndex;

    const sections = document.querySelectorAll('.slide-section');
    sections.forEach((section, idx) => {
      section.classList.remove(
        'is-active', 'is-past', 'is-future',
        'mobile-flip-out', 'mobile-flip-in', 'mobile-underneath',
        'desktop-out-up', 'desktop-in', 'desktop-out-down'
      );
      section.style.transition = '';
      section.setAttribute('aria-hidden', String(idx !== activeIndex));
      section.inert = idx !== activeIndex;

      if (idx === activeIndex) {
        section.classList.add('is-active');
      } else if (idx < activeIndex) {
        section.classList.add('is-past');
      } else {
        section.classList.add('is-future');
      }
    });
  }

  goToNextSlide() {
    if (this.isTransitioning) return;
    if (this.currentIndex < this.slides.length - 1) {
      this.transitionToSlide(this.currentIndex + 1, 'next');
    }
  }

  goToPrevSlide() {
    if (this.isTransitioning) return;
    if (this.currentIndex > 0) {
      this.transitionToSlide(this.currentIndex - 1, 'prev');
    }
  }

  transitionToSlide(targetIndex, direction) {
    if (this.isTransitioning || targetIndex === this.currentIndex) return;
    if (targetIndex < 0 || targetIndex >= this.slides.length) return;

    this.isTransitioning = true;
    const isMobile = window.innerWidth <= 768;

    const currentSection = document.getElementById(`slide-${this.currentIndex}`);
    const targetSection = document.getElementById(`slide-${targetIndex}`);

    if (!currentSection || !targetSection) {
      this.updateStaticStates(targetIndex);
      this.isTransitioning = false;
      return;
    }

    const currentSlide = this.slides[this.currentIndex];
    const targetSlide = this.slides[targetIndex];
    const duration = isMobile ? 580 : 650;

    if (isMobile) {
      if (direction === 'next') {
        // Prepare target underneath without transition
        targetSection.style.transition = 'none';
        targetSection.className = `slide-section theme-${targetSlide.bgTheme} mobile-underneath`;
        targetSection.offsetHeight; // trigger reflow
        targetSection.style.transition = '';

        requestAnimationFrame(() => {
          currentSection.className = `slide-section theme-${currentSlide.bgTheme} mobile-flip-out`;
          targetSection.className = `slide-section theme-${targetSlide.bgTheme} mobile-flip-in is-active`;
        });
      } else {
        // Prev: Target starts flipped open on the left on top (z-index 30)
        targetSection.style.transition = 'none';
        targetSection.className = `slide-section theme-${targetSlide.bgTheme} mobile-flip-out`;
        targetSection.offsetHeight; // trigger reflow
        targetSection.style.transition = '';

        requestAnimationFrame(() => {
          targetSection.className = `slide-section theme-${targetSlide.bgTheme} mobile-flip-in is-active`;
          currentSection.className = `slide-section theme-${currentSlide.bgTheme} mobile-underneath`;
        });
      }
    } else {
      // Desktop
      if (direction === 'next') {
        // Target starts below without transition
        targetSection.style.transition = 'none';
        targetSection.className = `slide-section theme-${targetSlide.bgTheme} desktop-out-down`;
        targetSection.offsetHeight; // trigger reflow
        targetSection.style.transition = '';

        requestAnimationFrame(() => {
          currentSection.className = `slide-section theme-${currentSlide.bgTheme} desktop-out-up`;
          targetSection.className = `slide-section theme-${targetSlide.bgTheme} desktop-in is-active`;
        });
      } else {
        // Prev: Target starts above without transition
        targetSection.style.transition = 'none';
        targetSection.className = `slide-section theme-${targetSlide.bgTheme} desktop-out-up`;
        targetSection.offsetHeight; // trigger reflow
        targetSection.style.transition = '';

        requestAnimationFrame(() => {
          currentSection.className = `slide-section theme-${currentSlide.bgTheme} desktop-out-down`;
          targetSection.className = `slide-section theme-${targetSlide.bgTheme} desktop-in is-active`;
        });
      }
    }

    setTimeout(() => {
      this.updateStaticStates(targetIndex);
      this.isTransitioning = false;
    }, duration);
  }

  isLocked() {
    const gate = document.getElementById('auth-gate');
    return gate && !gate.classList.contains('is-hidden');
  }

  setupDesktopScroll() {
    // Smooth wheel scroll transition with momentum damping
    let wheelDeltaAccumulator = 0;
    let wheelCooldown = false;

    window.addEventListener('wheel', (e) => {
      if (this.isLocked()) return;
      if (window.innerWidth <= 768) return;
      e.preventDefault();

      if (wheelCooldown || this.isTransitioning) return;

      wheelDeltaAccumulator += e.deltaY;

      if (Math.abs(wheelDeltaAccumulator) >= 25) {
        if (wheelDeltaAccumulator > 0) {
          this.goToNextSlide();
        } else {
          this.goToPrevSlide();
        }
        wheelDeltaAccumulator = 0;
        wheelCooldown = true;

        setTimeout(() => {
          wheelCooldown = false;
          wheelDeltaAccumulator = 0;
        }, 650);
      }
    }, { passive: false });
  }

  setupMobileGestures() {
    let touchStartX = 0;
    let touchStartY = 0;

    window.addEventListener('touchstart', (e) => {
      if (this.isLocked()) return;
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (this.isLocked() || this.isTransitioning) return;
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      // Detect horizontal swipe
      if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.1) {
        if (diffX < 0) {
          this.goToNextSlide();
        } else {
          this.goToPrevSlide();
        }
      }
    }, { passive: true });

    // Tap edges on mobile to turn pages (left 35% / right 35%)
    this.deckContainer.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      if (this.isLocked()) return;
      if (window.innerWidth > 768) return;
      if (this.isTransitioning) return;

      const clickX = e.clientX;
      const screenWidth = window.innerWidth;

      if (clickX > screenWidth * 0.65) {
        this.goToNextSlide();
      } else if (clickX < screenWidth * 0.35) {
        this.goToPrevSlide();
      }
    });

    // Handle viewport resize cleanly
    window.addEventListener('resize', () => {
      if (!this.isTransitioning) {
        this.updateStaticStates(this.currentIndex);
      }
    });
  }

  setupKeyboardNavigation() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (this.isLocked() || this.isTransitioning) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        this.goToNextSlide();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.goToPrevSlide();
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (this.currentIndex !== 0) {
          this.transitionToSlide(0, 'prev');
        }
      } else if (e.key === 'End') {
        e.preventDefault();
        if (this.currentIndex !== this.slides.length - 1) {
          this.transitionToSlide(this.slides.length - 1, 'next');
        }
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new PresentationDeck();
  new AuthManager();
});
