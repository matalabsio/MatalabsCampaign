// ==========================================================================
// MATA LABS PRESENTATION — 3D PAGE ANIMATION ENGINE
// Phone: 3D Physical Page Flip (like a luxury physical lookbook)
// Desktop: 3D Page Lift & Depth Animation (smooth full-page transition)
// ==========================================================================

import { inject } from '@vercel/analytics';
import { slidesData } from './src/data/slides.js';
import { initializeAnalytics } from './src/analytics/client.mjs';

const analyticsApi = import.meta.env.VITE_ANALYTICS_API_URL || '';
const analyticsState = initializeAnalytics(analyticsApi, slidesData.length);
const analytics = analyticsState.client;

// Custom tracking replaces the Vercel tracker when its backend is configured.
if (!analyticsState.configured) inject({ mode: import.meta.env.PROD ? 'production' : 'development' });


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
  constructor() {
    this.gateEl = document.getElementById('auth-gate');
    this.inputEl = document.getElementById('auth-input');
    this.errorEl = document.getElementById('auth-error');
    const visibilityButton = document.getElementById('auth-visibility-btn');
    visibilityButton.addEventListener('click', () => {
      const show = this.inputEl.type === 'password';
      this.inputEl.type = show ? 'text' : 'password';
      visibilityButton.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      visibilityButton.setAttribute('aria-pressed', String(show));
      visibilityButton.title = show ? 'Hide password' : 'Show password';
    });
    document.getElementById('auth-form').addEventListener('submit', event => this.handleSubmit(event));
    window.addEventListener('analytics:expired', () => {
      this.gateEl.classList.remove('is-hidden','is-unlocked');
      this.errorEl.textContent = 'Session expired. Please enter the access key again.';
      this.errorEl.style.display = 'block';
    });
    // Keep the existing presentation usable until the Cloudflare URL is configured.
    // Configured analytics always authenticates with the backend; old local sessions cannot authorize it.
    if (analyticsState.error) {
      this.errorEl.textContent = analyticsState.error;
      this.errorEl.style.display = 'block';
    }
    if (!analyticsState.configured) {
      try {
        const saved = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY));
        if (saved?.authenticated && saved.hash === TARGET_PASS_HASH && saved.expiresAt > Date.now()) this.gateEl.classList.add('is-hidden');
      } catch { /* Storage may be disabled. */ }
    }
  }
  async handleSubmit(event) {
    event.preventDefault();
    const password = this.inputEl.value.trim();
    if (!password || this.pending) return;
    this.pending = true;
    const button = document.getElementById('auth-submit-btn');
    button.disabled = true;
    this.errorEl.style.display = 'none';
    try {
      if (analyticsState.error) throw Error(analyticsState.error);
      if (analytics) {
        await analytics.unlock(password, Number(document.querySelector('.slide-section.is-active')?.dataset.slideIndex || 0));
      } else {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
        const hash = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        if (hash !== TARGET_PASS_HASH) throw Error('Incorrect access key. Please try again.');
        try {localStorage.setItem(AUTH_SESSION_KEY,JSON.stringify({authenticated:true,hash,expiresAt:Date.now()+SESSION_DURATION_MS}));} catch { /* Optional storage. */ }
      }
      this.inputEl.value = '';
      this.gateEl.classList.add('is-unlocked');
      setTimeout(()=>this.gateEl.classList.add('is-hidden'),650);
    } catch (error) {
      this.errorEl.textContent = error.name === 'TimeoutError' || error instanceof TypeError ? 'Unable to connect. Please try again.' : error.message;
      this.errorEl.style.display = 'block';
      this.inputEl.select();
    } finally { this.pending=false;button.disabled=false; }
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
      for (const [linkIndex, link] of (slide.links || []).entries()) {
        const anchor = document.createElement('a');
        anchor.className = 'slide-link';
        anchor.href = link.href;
        anchor.dataset.linkId = `${idx}:${linkIndex}`;
        anchor.dataset.slide = String(idx);
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
    analytics?.slide(activeIndex);

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
