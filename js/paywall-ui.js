// Lock modal → parental gate → purchase sheet (native kids build only).
// Pixel/neon styling via css/style.css paywall-* classes.

import { GRADE_LABEL } from './balance.js';
import * as Entitlements from './entitlements.js';

const parentalGate = {
  failCount: 0,
  cooldownUntil: 0,
};

function newArithmeticChallenge() {
  const a = Math.floor(Math.random() * 90) + 10;
  const b = Math.floor(Math.random() * 90) + 10;
  const useMultiply = Math.random() < 0.5;
  if (useMultiply) {
    return { text: `${a}×${b}`, answer: a * b };
  }
  return { text: `${a}+${b}`, answer: a + b };
}

function createOverlay({ title, bodyHtml, cardClass = '', dismissOnBackdrop = true }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'paywall-backdrop';
  backdrop.innerHTML = `
    <div class="paywall-card card ${cardClass}" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
      <h2 class="paywall-title" id="paywall-title">${title}</h2>
      <div class="paywall-body">${bodyHtml}</div>
    </div>
  `;
  const card = backdrop.querySelector('.paywall-card');
  const close = () => backdrop.remove();

  backdrop.addEventListener('click', (e) => {
    if (dismissOnBackdrop && e.target === backdrop) close();
  });

  document.body.appendChild(backdrop);
  return { root: card, backdrop, close };
}

function showAlert({ title, message }) {
  const modal = createOverlay({
    title,
    bodyHtml: `<p class="paywall-message">${message}</p>
      <div class="paywall-actions paywall-actions--stack">
        <button type="button" class="primary" data-paywall-ok>OK</button>
      </div>`,
    dismissOnBackdrop: true,
  });
  modal.root.querySelector('[data-paywall-ok]')?.addEventListener('click', () => modal.close());
  return modal;
}

export function createPaywallUI({ onUnlock }) {
  function refreshAfterUnlock() {
    if (onUnlock) onUnlock();
  }

  function showLockedGradeModal(grade) {
    const label = GRADE_LABEL[grade] || grade;
    const modal = createOverlay({
      title: 'LOCKED!',
      cardClass: 'paywall-card--grade-lock',
      bodyHtml: `
        <p class="paywall-message paywall-grade-lock-msg">
          <span class="paywall-lock-icon" aria-hidden="true">🔒</span>
          このレベルはまだロックされている！<br>
          <span class="paywall-grade-name">${label}</span>のことばを遊ぶには、保護者の方のお手伝いが必要だよ。
        </p>
        <div class="paywall-actions paywall-actions--stack">
          <button type="button" class="primary" id="grade-lock-parent-btn">保護者の方へ</button>
          <button type="button" id="grade-lock-close-btn">とじる</button>
        </div>`,
    });

    modal.root.querySelector('#grade-lock-close-btn')?.addEventListener('click', () => modal.close());
    modal.root.querySelector('#grade-lock-parent-btn')?.addEventListener('click', () => {
      modal.close();
      showParentalGate(grade);
    });
  }

  function showParentalGate(grade) {
    const now = Date.now();
    if (parentalGate.cooldownUntil > now) {
      const secs = Math.ceil((parentalGate.cooldownUntil - now) / 1000);
      showAlert({
        title: '少し待ってね',
        message: `もう一度試すには ${secs} 秒待ってください。`,
      });
      return;
    }

    let current = newArithmeticChallenge();
    const modal = createOverlay({
      title: '保護者の方へ',
      cardClass: 'paywall-card--parental-gate',
      dismissOnBackdrop: false,
      bodyHtml: `
        <p class="paywall-hint">お子さまの操作を防ぐため、計算問題にお答えください。</p>
        <p class="paywall-question" id="parental-gate-question">保護者の方へ: ${current.text} = ?</p>
        <input type="number" inputmode="numeric" class="paywall-input" id="parental-gate-answer"
               autocomplete="off" aria-label="答えを入力">
        <p class="paywall-error" id="parental-gate-error" hidden></p>
        <div class="paywall-actions paywall-actions--stack">
          <button type="button" class="primary" id="parental-gate-submit">確認する</button>
          <button type="button" id="parental-gate-cancel">キャンセル</button>
        </div>`,
    });

    const questionEl = modal.root.querySelector('#parental-gate-question');
    const inputEl = modal.root.querySelector('#parental-gate-answer');
    const errorEl = modal.root.querySelector('#parental-gate-error');

    const regenerate = () => {
      current = newArithmeticChallenge();
      if (questionEl) questionEl.textContent = `保護者の方へ: ${current.text} = ?`;
      if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
      }
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
    };

    const fail = (message) => {
      parentalGate.failCount += 1;
      if (parentalGate.failCount >= 3) {
        parentalGate.failCount = 0;
        parentalGate.cooldownUntil = Date.now() + 60 * 1000;
        modal.close();
        showAlert({
          title: '少し待ってね',
          message: '3回間違えました。60秒後にもう一度お試しください。',
        });
        return;
      }
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = message;
      }
      regenerate();
    };

    const trySubmit = () => {
      const raw = inputEl ? String(inputEl.value).trim() : '';
      if (!raw.length) {
        fail('答えを入力してください。');
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.trunc(n) !== n) {
        fail('数字で答えてください。');
        return;
      }
      if (n !== current.answer) {
        fail('答えが違います。もう一度。');
        return;
      }
      parentalGate.failCount = 0;
      modal.close();
      showPurchaseSheet(grade);
    };

    modal.root.querySelector('#parental-gate-submit')?.addEventListener('click', trySubmit);
    modal.root.querySelector('#parental-gate-cancel')?.addEventListener('click', () => modal.close());
    inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') trySubmit();
    });
    inputEl?.focus();
  }

  function showPurchaseSheet(grade) {
    const productId = Entitlements.productForGrade(grade);
    const product = productId ? Entitlements.PRODUCTS[productId] : null;
    const bundle = Entitlements.PRODUCTS.unlock_all;
    const gradeLabel = GRADE_LABEL[grade] || grade;
    const priceStr = product ? Entitlements.formatPriceYen(product.priceYen) : '';
    const bundleStr = Entitlements.formatPriceYen(bundle.priceYen);

    const modal = createOverlay({
      title: `${gradeLabel}をアンロック`,
      cardClass: 'paywall-card--purchase',
      dismissOnBackdrop: false,
      bodyHtml: `
        <p class="paywall-message paywall-purchase-lead">${gradeLabel}のことばを学べるようになります。</p>
        <p class="paywall-price">${priceStr}</p>
        <div class="paywall-actions paywall-actions--stack paywall-purchase-actions">
          <button type="button" class="primary" id="purchase-grade-btn" ${productId ? '' : 'disabled'}>購入する</button>
          <button type="button" id="purchase-bundle-btn">すべてのレベルをまとめて購入（${bundleStr}）</button>
          <button type="button" class="paywall-restore-btn" id="purchase-restore-btn">購入の復元</button>
        </div>
        <p class="paywall-status" id="purchase-sheet-status"></p>`,
    });

    const statusEl = modal.root.querySelector('#purchase-sheet-status');
    const setStatus = (msg) => {
      if (statusEl) statusEl.textContent = msg || '';
    };

    const onPurchase = async (id) => {
      setStatus('処理中…');
      const result = await Entitlements.purchase(id);
      if (result.ok) {
        modal.close();
        refreshAfterUnlock();
        showAlert({ title: 'ありがとうございます', message: 'アンロックしました！' });
      } else if (result.reason === 'cancelled') {
        setStatus('');
      } else if (result.reason === 'unavailable') {
        setStatus('ストア接続がありません');
      } else {
        setStatus('購入できませんでした。もう一度お試しください。');
      }
    };

    modal.root.querySelector('#purchase-grade-btn')?.addEventListener('click', () => {
      if (productId) onPurchase(productId);
    });
    modal.root.querySelector('#purchase-bundle-btn')?.addEventListener('click', () => onPurchase('unlock_all'));
    modal.root.querySelector('#purchase-restore-btn')?.addEventListener('click', async () => {
      setStatus('復元中…');
      const result = await Entitlements.restore();
      if (result.ok && result.restored) {
        modal.close();
        refreshAfterUnlock();
        showAlert({ title: '復元しました', message: '以前の購入を復元しました。' });
      } else if (result.ok) {
        setStatus('復元できる購入が見つかりませんでした。');
      } else if (result.reason === 'unavailable') {
        setStatus('ストア接続がありません');
      } else {
        setStatus('復元できませんでした。');
      }
    });
  }

  return { showLockedGradeModal, showParentalGate, showPurchaseSheet };
}
