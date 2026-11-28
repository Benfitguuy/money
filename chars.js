// 人物與布偶貓（Adam 原創 SVG；行事曆與錢包共用同一份，改一邊要複製到另一邊）
// 座標：腳底在 (0,0)，面向右邊。大頭用 icons/boy.svg、girl.svg（不變）。
// v2（2026-11-28）：Sarah 指定「大頭不變、換身體」，身體參考公仔風：
//   Ben＝綠毛衣、卡其褲、咖啡鞋；Sarah＝粉紅上衣、淺粉裙、白襪、粉鞋。
const CHAR_LINE = '#5A4048';

function charBen() {
  return `<ellipse cx="0" cy="0" rx="10" ry="2.6" fill="#000" opacity=".12"/>
    <g class="leg l1"><rect x="-6" y="-13" width="5.4" height="12" rx="2.4" fill="#CDB88E"/><ellipse cx="-3.6" cy="-1.3" rx="3.8" ry="2" fill="#6E4C3A"/></g>
    <g class="leg l2"><rect x=".6" y="-13" width="5.4" height="12" rx="2.4" fill="#BFA97F"/><ellipse cx="3.6" cy="-1.3" rx="3.8" ry="2" fill="#5E4030"/></g>
    <rect class="arm a1" x="-11.2" y="-25" width="4.4" height="12.5" rx="2.2" fill="#5C8A6C"/><circle cx="-9" cy="-12.6" r="2.3" fill="#FBDCC8"/>
    <path d="M-8.4 -11.5 Q-9.6 -27.5 0 -28 Q9.6 -27.5 8.4 -11.5 Q0 -9.8 -8.4 -11.5Z" fill="#6A9A79"/>
    <path d="M-8.3 -13.6 Q0 -11.8 8.3 -13.6" stroke="#58856A" stroke-width="1.6" fill="none"/>
    <path d="M-3.4 -27.6 Q0 -25 3.4 -27.6" stroke="#58856A" stroke-width="1.4" fill="none"/>
    <rect class="arm a2" x="6.8" y="-25" width="4.4" height="12.5" rx="2.2" fill="#5C8A6C"/><circle cx="9" cy="-12.6" r="2.3" fill="#FBDCC8"/>
    <image href="icons/boy.svg" x="-15" y="-55" width="30" height="30"/>`;
}

function charSarah() {
  return `<ellipse cx="0" cy="0" rx="9.5" ry="2.5" fill="#000" opacity=".12"/>
    <g class="leg l1"><rect x="-5" y="-9.5" width="3.6" height="8.5" rx="1.8" fill="#FBDCC8"/><rect x="-5" y="-4.6" width="3.6" height="3.4" rx="1" fill="#fff"/><ellipse cx="-3.4" cy="-1.1" rx="3.2" ry="1.8" fill="#D88A9B"/></g>
    <g class="leg l2"><rect x="1.4" y="-9.5" width="3.6" height="8.5" rx="1.8" fill="#F5D0BA"/><rect x="1.4" y="-4.6" width="3.6" height="3.4" rx="1" fill="#F4F4F4"/><ellipse cx="3.4" cy="-1.1" rx="3.2" ry="1.8" fill="#C97A8C"/></g>
    <path d="M-6.5 -17 L6.5 -17 L9.6 -8.6 Q0 -6.8 -9.6 -8.6Z" fill="#F6D4D6"/>
    <rect class="arm a1" x="-10.6" y="-25.4" width="4.2" height="11" rx="2.1" fill="#F1A9B6"/><circle cx="-8.5" cy="-14.2" r="2.1" fill="#FBDCC8"/>
    <path d="M-7.4 -16.4 Q-8.6 -27.6 0 -28 Q8.6 -27.6 7.4 -16.4 Q0 -15.2 -7.4 -16.4Z" fill="#F4B4C0"/>
    <path d="M-3.2 -27.6 Q0 -25.4 3.2 -27.6" stroke="#E595A5" stroke-width="1.3" fill="none"/>
    <rect class="arm a2" x="6.4" y="-25.4" width="4.2" height="11" rx="2.1" fill="#F1A9B6"/><circle cx="8.5" cy="-14.2" r="2.1" fill="#FBDCC8"/>
    <image href="icons/girl.svg" x="-15" y="-55" width="30" height="30"/>`;
}

// 布偶貓（海豹重點色）：大頭、藍色大眼睛、白圍脖、深色腳和尾巴
function charCat(gid = 'catmask') {
  const L = `stroke="${CHAR_LINE}" stroke-width=".7" stroke-linejoin="round"`;
  return `<defs><radialGradient id="${gid}" cx="50%" cy="62%" r="58%"><stop offset="0" stop-color="#4E3628" stop-opacity=".95"/><stop offset=".55" stop-color="#6E4E3C" stop-opacity=".7"/><stop offset="1" stop-color="#8A6A55" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="0" cy=".4" rx="12.5" ry="2.6" fill="#000" opacity=".12"/>
    <path d="M-10 -10 C-19 -10 -22 -19 -18 -26 C-16 -29.5 -12 -28.5 -12.6 -25 C-15 -20 -13.4 -15.4 -7.6 -13Z" fill="#6B4C3B" ${L}/>
    <rect class="leg l2" x="-8.4" y="-7" width="4.2" height="7" rx="2.1" fill="#6B4C3B"/><rect class="leg l1" x="4.6" y="-7" width="4.2" height="7" rx="2.1" fill="#6B4C3B"/>
    <ellipse cx="-1" cy="-10" rx="12" ry="7.2" fill="#F3E8DA" ${L}/>
    <path d="M-11.6 -12 Q-1 -18.6 9.6 -13.4 Q-1 -15.4 -11.6 -10.2Z" fill="#D9C2AA"/>
    <rect class="leg l1" x="-5" y="-6" width="4.2" height="6" rx="2.1" fill="#5B4033"/><rect class="leg l2" x="7.4" y="-6" width="4.2" height="6" rx="2.1" fill="#5B4033"/>
    <path d="M4.6 -16.6 Q12.6 -14 12.4 -7.4 Q10.6 -5.6 9.4 -7.4 Q8.2 -4.6 6.2 -6.6 Q4.4 -4.8 3.8 -8.6Z" fill="#fff"/>
    <path d="M5.2 -24 L5.8 -35.4 L13.2 -28.4Z M16.8 -28.4 L23.4 -35.4 L23.6 -24Z" fill="#5B4033" ${L}/>
    <path d="M6.8 -26.4 L7.2 -32.4 L11.2 -28.6Z M18.6 -28.6 L22.2 -32.4 L22.2 -26.4Z" fill="#E8B4B8"/>
    <ellipse cx="14.4" cy="-21.4" rx="10.2" ry="9.2" fill="#F7F0E6" ${L}/>
    <path d="M5 -17.4 Q3.6 -14.6 6 -13.4 Q6.4 -11 8.8 -12.4 M23.8 -17.4 Q25.2 -14.6 22.8 -13.4 Q22.4 -11 20 -12.4" fill="#fff" stroke="${CHAR_LINE}" stroke-width=".5"/>
    <ellipse cx="14.4" cy="-20.2" rx="8.4" ry="7.4" fill="url(#${gid})"/>
    <ellipse cx="10.8" cy="-22" rx="2.8" ry="3.2" fill="#5AA7E6" stroke="#2E2226" stroke-width=".6"/><ellipse cx="18" cy="-22" rx="2.8" ry="3.2" fill="#5AA7E6" stroke="#2E2226" stroke-width=".6"/>
    <ellipse cx="10.9" cy="-21.6" rx="1.3" ry="1.8" fill="#1E2A44"/><ellipse cx="18.1" cy="-21.6" rx="1.3" ry="1.8" fill="#1E2A44"/>
    <circle cx="11.7" cy="-23.2" r="1" fill="#fff"/><circle cx="18.9" cy="-23.2" r="1" fill="#fff"/>
    <path d="M13.5 -18 h1.8 l-.9 1.05z" fill="#E79AA8"/>
    <path d="M14.4 -16.9 q-1 1.2 -2 .4 M14.4 -16.9 q1 1.2 2 .4" stroke="#2E2226" stroke-width=".55" fill="none" stroke-linecap="round"/>`;
}
