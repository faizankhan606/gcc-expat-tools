// GCC Expat Calculator — all calculations run in the browser, nothing is sent anywhere
// except one request for public exchange rates.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const num = (id) => Math.max(0, parseFloat($(id).value) || 0);
  const radio = (name) => (document.querySelector(`input[name="${name}"]:checked`) || {}).value;
  const CUR = { uae: 'AED', kuwait: 'KWD' };
  const fmt = (n, cur) =>
    `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: cur === 'KWD' ? 3 : 0, maximumFractionDigits: cur === 'KWD' ? 3 : 0 })}`;
  const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  // ---------- exchange rates (INR per 1 unit) ----------
  const rates = { AED: 25.42, KWD: 300.1, live: false, date: 'Nov 2026 fallback' };
  let manualRate = null;

  function rateFor(cur) {
    return manualRate && manualRate.cur === cur ? manualRate.value : rates[cur];
  }
  function showRate(cur, onChange) {
    const box = $('rate');
    if (!box) return;
    $('rate-label').textContent = `1 ${cur} =`;
    const input = $('rate-input');
    if (!manualRate || manualRate.cur !== cur) {
      manualRate = null;
      input.value = rates[cur].toFixed(2);
    }
    $('rate-src').textContent = rates.live ? `INR (live rate, ${rates.date})` : `INR (${rates.date}; edit if needed)`;
    input.oninput = () => {
      const v = parseFloat(input.value);
      manualRate = v > 0 ? { cur, value: v } : null;
      onChange();
    };
  }
  function loadRates(done) {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((r) => r.json())
      .then((j) => {
        if (!j.rates || !j.rates.INR) return;
        rates.AED = j.rates.INR / j.rates.AED;
        rates.KWD = j.rates.INR / j.rates.KWD;
        rates.live = true;
        rates.date = new Date(j.time_last_update_utc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        done();
      })
      .catch(() => {});
  }
  // Switching country swaps the salary to a typical figure in the new currency,
  // so AED 8,000 does not silently become KWD 8,000.
  function swapSalaryOnCountry(form, defaults) {
    for (const r of form.querySelectorAll('input[name="country"]')) {
      r.addEventListener('change', () => { $('salary').value = defaults[r.value]; });
    }
  }
  function bind(form, fn) {
    form.addEventListener('input', fn);
    form.addEventListener('change', fn);
    form.addEventListener('submit', (e) => e.preventDefault());
    fn();
    loadRates(fn);
  }
  const rows = (el, list) => {
    el.innerHTML = '';
    for (const [k, v] of list) {
      const li = document.createElement('li');
      const a = document.createElement('span');
      const b = document.createElement('span');
      a.textContent = k;
      b.textContent = v;
      li.append(a, b);
      el.append(li);
    }
  };

  // ---------- 1. gratuity / end-of-service ----------
  // UAE: Federal Decree-Law 33/2021 — 21 days' basic wage per year for the first 5 years,
  // 30 days per year after; needs 1+ year of service; capped at 2 years' wage. Daily wage = basic / 30.
  function uaeGratuity(basic, years) {
    if (years < 1) return { amount: 0, full: 0, capped: false, reason: 'UAE gratuity needs at least 1 full year of continuous service.' };
    const daily = basic / 30;
    const raw = Math.min(years, 5) * 21 * daily + Math.max(years - 5, 0) * 30 * daily;
    const cap = basic * 24;
    return { amount: Math.min(raw, cap), full: raw, capped: raw > cap, first5: Math.min(years, 5) * 21 * daily, after5: Math.max(years - 5, 0) * 30 * daily };
  }
  // Kuwait: Law 6/2010 Art. 51 & 53 (monthly-paid workers) — 15 days' wage per year for the first
  // 5 years (daily wage = monthly / 26), one month per year after; capped at 1.5 years' wage.
  // Resignation: <3y nothing, 3–5y half, 5–10y two-thirds, 10y+ full.
  function kuwaitIndemnity(wage, years, resigned) {
    const first5 = Math.min(years, 5) * 15 * (wage / 26);
    const after5 = Math.max(years - 5, 0) * wage;
    const raw = first5 + after5;
    const cap = wage * 18;
    const full = Math.min(raw, cap);
    let factor = 1;
    let reason = '';
    if (resigned) {
      if (years < 3) { factor = 0; reason = 'Resigning before 3 years of service gives no indemnity under Article 53.'; }
      else if (years < 5) { factor = 0.5; reason = 'Resigning between 3 and 5 years gives half of the indemnity.'; }
      else if (years < 10) { factor = 2 / 3; reason = 'Resigning between 5 and 10 years gives two-thirds of the indemnity.'; }
    }
    return { amount: full * factor, full, capped: raw > cap, first5, after5, factor, reason };
  }

  function initGratuity() {
    const form = $('gratuity-form');
    if (!form) return;
    swapSalaryOnCountry(form, { uae: 5000, kuwait: 450 });
    bind(form, () => {
      const country = radio('country');
      const cur = CUR[country];
      const kw = country === 'kuwait';
      $('reason-field').hidden = !kw;
      $('salary-label').firstChild.textContent = kw ? 'Last monthly wage (KWD) ' : 'Basic monthly salary (AED) ';
      $('salary-hint').textContent = kw
        ? 'Kuwait uses your last full wage, including regular allowances.'
        : 'Basic salary only — housing, transport and other allowances are excluded.';
      const salary = num('salary');
      const years = num('years') + Math.min(num('months'), 11) / 12;
      const r = kw ? kuwaitIndemnity(salary, years, radio('reason') === 'resigned') : uaeGratuity(salary, years);
      showRate(cur, () => form.dispatchEvent(new Event('change')));

      $('out-amount').textContent = fmt(r.amount, cur);
      $('out-inr').textContent = `≈ ${inr(r.amount * rateFor(cur))}`;
      const list = [];
      if (r.first5 !== undefined) {
        list.push([kw ? 'First 5 years (15 days/year)' : 'First 5 years (21 days/year)', fmt(r.first5, cur)]);
        list.push([kw ? 'After 5 years (1 month/year)' : 'After 5 years (30 days/year)', fmt(r.after5, cur)]);
      }
      if (r.capped) list.push([kw ? 'Cap applied (1.5 years of wage)' : 'Cap applied (2 years of wage)', fmt(kw ? salary * 18 : salary * 24, cur)]);
      if (kw && r.factor < 1) list.push(['Share payable on resignation', r.factor === 0 ? 'None' : r.factor === 0.5 ? 'Half' : 'Two-thirds']);
      rows($('out-rows'), list);
      $('out-note').textContent = r.reason || '';
      $('out-note').hidden = !r.reason;
    });
  }

  // ---------- 2. visa overstay fine ----------
  const DAY = 86400000;
  const parseDate = (v) => (v ? Date.parse(v + 'T00:00:00Z') : NaN);

  const VISA = {
    uae: [
      { id: 'residence', label: 'Residence visa (cancelled or expired)', grace: 30 },
      { id: 'visit', label: 'Tourist / visit visa', grace: 0 },
    ],
    kuwait: [
      { id: 'residence', label: 'Residence permit (Article 17, 18, 22 etc.)', grace: 0 },
      { id: 'visit', label: 'Visit visa', grace: 0 },
      { id: 'domestic', label: 'Domestic worker residence', grace: 0 },
    ],
  };

  function overstayFine(country, type, days) {
    if (days <= 0) return { fine: 0, parts: [] };
    if (country === 'uae') return { fine: days * 50, parts: [[`${days} day${days > 1 ? 's' : ''} × AED 50`, fmt(days * 50, 'AED')]] };
    if (type === 'visit') {
      const raw = days * 10;
      return { fine: Math.min(raw, 2000), capped: raw > 2000, parts: [[`${days} day${days > 1 ? 's' : ''} × KWD 10`, fmt(raw, 'KWD')]], cap: 2000 };
    }
    if (type === 'domestic') {
      const raw = days * 2;
      return { fine: Math.min(raw, 600), capped: raw > 600, parts: [[`${days} day${days > 1 ? 's' : ''} × KWD 2`, fmt(raw, 'KWD')]], cap: 600 };
    }
    const d1 = Math.min(days, 30);
    const d2 = Math.max(days - 30, 0);
    const raw = d1 * 2 + d2 * 4;
    const parts = [[`First month: ${d1} day${d1 > 1 ? 's' : ''} × KWD 2`, fmt(d1 * 2, 'KWD')]];
    if (d2) parts.push([`After first month: ${d2} day${d2 > 1 ? 's' : ''} × KWD 4`, fmt(d2 * 4, 'KWD')]);
    return { fine: Math.min(raw, 1200), capped: raw > 1200, parts, cap: 1200 };
  }

  function initVisa() {
    const form = $('visa-form');
    if (!form) return;
    let lastKey = '';
    $('exit').value = new Date().toISOString().slice(0, 10);
    bind(form, () => {
      const country = radio('country');
      const cur = CUR[country];
      const sel = $('visa-type');
      if (sel.dataset.country !== country) {
        sel.innerHTML = '';
        for (const t of VISA[country]) sel.add(new Option(t.label, t.id));
        sel.dataset.country = country;
      }
      const type = VISA[country].find((t) => t.id === sel.value) || VISA[country][0];
      const key = country + type.id;
      if (key !== lastKey) { $('grace').value = type.grace; lastKey = key; }
      $('grace-field').hidden = country === 'kuwait';
      const grace = country === 'kuwait' ? 0 : Math.round(num('grace'));

      const expiry = parseDate($('expiry').value);
      const exit = parseDate($('exit').value);
      showRate(cur, () => form.dispatchEvent(new Event('change')));
      const note = $('out-note');
      note.hidden = true;
      if (isNaN(expiry) || isNaN(exit)) {
        $('out-amount').textContent = '—';
        $('out-inr').textContent = 'Enter both dates to see the fine.';
        rows($('out-rows'), []);
        return;
      }
      const past = Math.round((exit - expiry) / DAY);
      const days = Math.max(0, past - grace);
      const r = overstayFine(country, type.id, days);
      $('out-amount').textContent = fmt(r.fine, cur);
      $('out-inr').textContent = days > 0 ? `≈ ${inr(r.fine * rateFor(cur))} for ${days} overstay day${days > 1 ? 's' : ''}` : 'No overstay on these dates.';
      const list = [];
      if (past > 0 && grace > 0) list.push(['Days after expiry / cancellation', String(past)], ['Grace period used', `${Math.min(grace, past)} days`]);
      list.push(...r.parts);
      if (r.capped) list.push(['Maximum fine applied', fmt(r.cap, cur)]);
      rows($('out-rows'), list);
      if (past < 0) { note.textContent = 'The exit date is before the expiry date, so there is no overstay.'; note.hidden = false; }
      else if (country === 'uae' && days > 0) { note.textContent = 'Service and admin fees charged at payment are extra and are not included here.'; note.hidden = false; }
    });
  }

  // ---------- 3. salary, savings and India equivalent ----------
  const COSTS = {
    uae: { rent: { shared: 1500, studio: 4000, onebr: 6500 }, food: 1000, transport: 400, bills: 500, other: 500 },
    kuwait: { rent: { shared: 90, studio: 220, onebr: 320 }, food: 80, transport: 30, bills: 25, other: 40 },
  };

  // India new tax regime, FY 2025-26 slabs: standard deduction 75,000, rebate up to 12L taxable
  // income (with marginal relief), 4% cess. Surcharge above 50L is ignored.
  function indiaTax(gross) {
    const ti = Math.max(0, gross - 75000);
    const slabs = [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]];
    let tax = 0;
    let prev = 0;
    for (const [limit, rate] of slabs) {
      if (ti > prev) tax += (Math.min(ti, limit) - prev) * rate;
      prev = limit;
    }
    if (ti <= 1200000) tax = 0;
    else tax = Math.min(tax, ti - 1200000);
    return tax * 1.04;
  }
  function grossForInHand(monthlyInHand) {
    const target = monthlyInHand * 12;
    let lo = target;
    let hi = target * 2 + 100000;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (mid - indiaTax(mid) < target) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  function initSalary() {
    const form = $('salary-form');
    if (!form) return;
    let lastKey = '';
    swapSalaryOnCountry(form, { uae: 8000, kuwait: 700 });
    bind(form, () => {
      const country = radio('country');
      const cur = CUR[country];
      const c = COSTS[country];
      const home = $('home').value;
      const key = country + home;
      if (key !== lastKey) {
        // reset the editable cost estimates when the country or housing type changes
        $('rent').value = c.rent[home];
        if (!lastKey.startsWith(country)) {
          $('food').value = c.food; $('transport').value = c.transport; $('bills').value = c.bills; $('other').value = c.other;
        }
        lastKey = key;
      }
      for (const el of document.querySelectorAll('[data-cur]')) el.textContent = cur;
      const housingPaid = $('housing-paid').checked;
      const transportPaid = $('transport-paid').checked;
      $('rent').disabled = housingPaid;
      $('transport').disabled = transportPaid;

      const salary = num('salary');
      const rent = housingPaid ? 0 : num('rent');
      const transport = transportPaid ? 0 : num('transport');
      const expenses = rent + num('food') + transport + num('bills') + num('other');
      const savings = salary - expenses;
      showRate(cur, () => form.dispatchEvent(new Event('change')));
      const rate = rateFor(cur);

      $('out-amount').textContent = `${savings < 0 ? '−' : ''}${fmt(Math.abs(savings), cur)}`;
      $('out-inr').textContent = `≈ ${savings < 0 ? '−' : ''}${inr(Math.abs(savings) * rate)} saved per month`;
      const list = [
        ['Salary', `${fmt(salary, cur)}  ·  ${inr(salary * rate)}`],
        ['Monthly expenses', `${fmt(expenses, cur)}  ·  ${inr(expenses * rate)}`],
        ['Savings per year', inr(Math.max(savings, 0) * rate * 12)],
      ];
      const note = $('out-note');
      if (savings > 0) {
        const inHand = savings * rate + num('india-cost');
        const gross = grossForInHand(inHand);
        list.push(['India in-hand needed for the same savings', `${inr(inHand)} / month`]);
        list.push(['Roughly equal to an India salary of', `₹${(gross / 100000).toFixed(1)} LPA (gross)`]);
        note.textContent = 'The India figure is an estimate using FY 2025-26 new-regime tax slabs. A CTC on an offer letter is usually higher than gross pay because it includes employer PF and gratuity.';
      } else {
        note.textContent = 'Expenses are higher than the salary on these numbers. Adjust the costs or check whether housing is provided.';
      }
      note.hidden = false;
      rows($('out-rows'), list);
    });
  }

  initGratuity();
  initVisa();
  initSalary();
})();
