// 人物與布偶貓（Adam 原創 SVG；行事曆與錢包共用同一份，改一邊要複製到另一邊）
// 座標：腳底在 (0,0)，面向右邊。大頭用 icons/boy.svg、girl.svg（不變）。
// v2（2026-11-28）：Sarah 指定「大頭不變、換身體」，身體參考公仔風：
//   Ben＝綠毛衣、卡其褲、咖啡鞋；Sarah＝粉紅上衣、淺粉裙、白襪、粉鞋。
const CHAR_LINE = '#5A4048';
// v4：大頭直接畫成 <g>（不用 <image> 也不用巢狀 <svg>，iPhone Safari 兩種都可能不顯示）。來源＝icons/boy.svg、girl.svg，換大頭要一起改這裡
const HEAD_BEN = '<g stroke="#5A4048" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"> <ellipse cx="8.6" cy="36.4" rx="4.6" ry="5.8" fill="#FBDCC8"/><ellipse cx="55.4" cy="36" rx="4.6" ry="5.8" fill="#FBDCC8"/> <path d="M32 5.6C48.6 5.2 58.4 17.8 58 34.2C57.6 50.4 46.8 59.2 31.6 59C16.8 58.8 6.4 50 6.2 34.4C6 17.8 16 6 32 5.6Z" fill="#FBDCC8"/> <path d="M16.6 28.4C18.6 26.8 21.8 26.6 24.2 27.6M39.8 27.6C42.2 26.6 45.4 26.8 47.4 28.4M28.6 47.2C30.6 49.8 33.6 49.8 35.6 47" fill="none"/></g> <path d="M19.6 14.4C23.4 11.2 27.6 10 31.8 10.2M37.4 10.8C38.6 11 39.8 11.4 40.8 11.8" stroke="#FFF6F0" stroke-width="2.6" stroke-linecap="round" fill="none"/> <ellipse cx="21.4" cy="37.2" rx="4.4" ry="5.2" fill="#3E2C30"/><ellipse cx="42.6" cy="37.2" rx="4.4" ry="5.2" fill="#3E2C30"/> <circle cx="23" cy="35.2" r="1.7" fill="#fff"/><circle cx="44.2" cy="35.2" r="1.7" fill="#fff"/><circle cx="20.2" cy="39.4" r=".8" fill="#fff"/><circle cx="41.4" cy="39.4" r=".8" fill="#fff"/> <ellipse cx="14.2" cy="45.4" rx="4.4" ry="2.6" fill="#F7A8B8" opacity=".85"/><ellipse cx="49.8" cy="45.4" rx="4.4" ry="2.6" fill="#F7A8B8" opacity=".85"/>';
const HEAD_SARAH = '<g stroke="#5A4048" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.8 40.4C3.8 18.6 17.4 3.8 32 3.8C46.8 3.8 60.4 18.4 56.4 40.4C58.4 50.4 56.6 58 52.4 60.8C48.6 62 46.4 58.6 46.2 56.4L17.8 56.4C17.6 58.6 15.4 62 11.6 60.8C7.4 58 5.8 50.4 7.8 40.4Z" fill="#B08060"/><path d="M32 10.2C46.2 10 54.4 21.2 54.2 35.2C54 49.4 45 58 31.8 57.8C18.8 57.6 10 49.2 9.8 35.2C9.6 21 18 10.4 32 10.2Z" fill="#FBDCC8"/><path d="M10.4 32.4C9.8 18 20 8.4 32 8.4C44.2 8.4 54.4 18 53.8 32.2C49.4 29.4 46.4 24.6 44.8 19.4C42.6 24.4 38.4 27.6 33.2 28.8C35 25.4 35.6 22.2 35 19C30 25.2 22 30.2 10.4 32.4Z" fill="#B08060"/></g><path d="M18.4 15.6C21.6 12.6 25.4 11.2 29 11" stroke="#D7B394" stroke-width="2.4" stroke-linecap="round" fill="none"/><g stroke="#5A4048" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.4 31.6C19.2 30.4 21.8 30.2 23.8 31M40.2 31C42.2 30.2 44.8 30.4 46.6 31.6M28.6 48.2C30.6 50.6 33.4 50.6 35.4 48" fill="none"/></g><ellipse cx="21.6" cy="39" rx="4.4" ry="5.2" fill="#3E2C30"/><ellipse cx="42.4" cy="39" rx="4.4" ry="5.2" fill="#3E2C30"/><circle cx="23.2" cy="37" r="1.7" fill="#fff"/><circle cx="44" cy="37" r="1.7" fill="#fff"/><circle cx="20.4" cy="41.2" r=".8" fill="#fff"/><circle cx="41.2" cy="41.2" r=".8" fill="#fff"/><ellipse cx="15" cy="46.4" rx="4.2" ry="2.5" fill="#F7A8B8" opacity=".85"/><ellipse cx="49" cy="46.4" rx="4.2" ry="2.5" fill="#F7A8B8" opacity=".85"/>';

function charBen() {
  return `<ellipse cx="0" cy="0" rx="10" ry="2.6" fill="#000" opacity=".12"/>
    <g class="leg l1"><rect x="-6" y="-13" width="5.4" height="12" rx="2.4" fill="#CDB88E"/><ellipse cx="-3.6" cy="-1.3" rx="3.8" ry="2" fill="#6E4C3A"/></g>
    <g class="leg l2"><rect x=".6" y="-13" width="5.4" height="12" rx="2.4" fill="#BFA97F"/><ellipse cx="3.6" cy="-1.3" rx="3.8" ry="2" fill="#5E4030"/></g>
    <rect class="arm a1" x="-11.2" y="-25" width="4.4" height="12.5" rx="2.2" fill="#5C8A6C"/><circle cx="-9" cy="-12.6" r="2.3" fill="#FBDCC8"/>
    <path d="M-8.4 -11.5 Q-9.6 -27.5 0 -28 Q9.6 -27.5 8.4 -11.5 Q0 -9.8 -8.4 -11.5Z" fill="#6A9A79"/>
    <path d="M-8.3 -13.6 Q0 -11.8 8.3 -13.6" stroke="#58856A" stroke-width="1.6" fill="none"/>
    <path d="M-3.4 -27.6 Q0 -25 3.4 -27.6" stroke="#58856A" stroke-width="1.4" fill="none"/>
    <rect class="arm a2" x="6.8" y="-25" width="4.4" height="12.5" rx="2.2" fill="#5C8A6C"/><circle cx="9" cy="-12.6" r="2.3" fill="#FBDCC8"/>
    <g transform="translate(-15,-55) scale(.46875)">${HEAD_BEN}</g>`;
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
    <g transform="translate(-15,-55) scale(.46875)">${HEAD_SARAH}</g>`;
}

// 布偶貓（海豹重點色）：大頭、藍色大眼睛、深色腳和尾巴（2026-11-28 Sarah：脖子、臉頰那圈白毛不要）
function charCat(gid = 'catmask') {
  const L = `stroke="${CHAR_LINE}" stroke-width=".7" stroke-linejoin="round"`;
  return `<defs><radialGradient id="${gid}" cx="50%" cy="62%" r="58%"><stop offset="0" stop-color="#4E3628" stop-opacity=".95"/><stop offset=".55" stop-color="#6E4E3C" stop-opacity=".7"/><stop offset="1" stop-color="#8A6A55" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="0" cy=".4" rx="12.5" ry="2.6" fill="#000" opacity=".12"/>
    <path d="M-10 -10 C-19 -10 -22 -19 -18 -26 C-16 -29.5 -12 -28.5 -12.6 -25 C-15 -20 -13.4 -15.4 -7.6 -13Z" fill="#6B4C3B" ${L}/>
    <rect class="leg l2" x="-8.4" y="-7" width="4.2" height="7" rx="2.1" fill="#6B4C3B"/><rect class="leg l1" x="4.6" y="-7" width="4.2" height="7" rx="2.1" fill="#6B4C3B"/>
    <ellipse cx="-1" cy="-10" rx="12" ry="7.2" fill="#F3E8DA" ${L}/>
    <path d="M-11.6 -12 Q-1 -18.6 9.6 -13.4 Q-1 -15.4 -11.6 -10.2Z" fill="#D9C2AA"/>
    <rect class="leg l1" x="-5" y="-6" width="4.2" height="6" rx="2.1" fill="#5B4033"/><rect class="leg l2" x="7.4" y="-6" width="4.2" height="6" rx="2.1" fill="#5B4033"/>
    <path d="M5.2 -24 L5.8 -35.4 L13.2 -28.4Z M16.8 -28.4 L23.4 -35.4 L23.6 -24Z" fill="#5B4033" ${L}/>
    <path d="M6.8 -26.4 L7.2 -32.4 L11.2 -28.6Z M18.6 -28.6 L22.2 -32.4 L22.2 -26.4Z" fill="#E8B4B8"/>
    <ellipse cx="14.4" cy="-21.4" rx="10.2" ry="9.2" fill="#F7F0E6" ${L}/>
    <ellipse cx="14.4" cy="-20.2" rx="8.4" ry="7.4" fill="url(#${gid})"/>
    <ellipse cx="10.8" cy="-22" rx="2.8" ry="3.2" fill="#5AA7E6" stroke="#2E2226" stroke-width=".6"/><ellipse cx="18" cy="-22" rx="2.8" ry="3.2" fill="#5AA7E6" stroke="#2E2226" stroke-width=".6"/>
    <ellipse cx="10.9" cy="-21.6" rx="1.3" ry="1.8" fill="#1E2A44"/><ellipse cx="18.1" cy="-21.6" rx="1.3" ry="1.8" fill="#1E2A44"/>
    <circle cx="11.7" cy="-23.2" r="1" fill="#fff"/><circle cx="18.9" cy="-23.2" r="1" fill="#fff"/>
    <path d="M13.5 -18 h1.8 l-.9 1.05z" fill="#E79AA8"/>
    <path d="M14.4 -16.9 q-1 1.2 -2 .4 M14.4 -16.9 q1 1.2 2 .4" stroke="#2E2226" stroke-width=".55" fill="none" stroke-linecap="round"/>`;
}

// 澳洲卡爾比犬（黑褐色）：腳底在 (0,0)，面向右邊。錢包小島、行事曆小房子共用（2026-11-28 從錢包 app.js 搬過來）
function charDog() {
  return `<ellipse cx="0" cy="0" rx="13" ry="2.8" fill="#000" opacity=".12"/>
      <path d="M-12 -12 Q-20 -10 -21 -3" stroke="#2E2A2A" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect class="leg l1" x="-10" y="-7" width="4" height="7" rx="2" fill="#C98A4B"/><rect class="leg l2" x="5" y="-7" width="4" height="7" rx="2" fill="#C98A4B"/>
      <ellipse cx="-2" cy="-11" rx="13" ry="6.5" fill="#2E2A2A"/><ellipse cx="7" cy="-9" rx="4" ry="4" fill="#C98A4B"/>
      <path d="M8 -22 L9 -32 L13 -24Z M14 -24 L18 -33 L19 -23Z" fill="#2E2A2A"/>
      <ellipse cx="14" cy="-19" rx="7" ry="6.5" fill="#2E2A2A"/><path d="M15 -17 Q22 -17 23 -14 Q20 -12 15 -13Z" fill="#C98A4B"/>
      <circle cx="22.5" cy="-15" r="1.3" fill="#1A1515"/><circle cx="13" cy="-21" r="1" fill="#C98A4B"/><circle cx="14.5" cy="-20" r="1.2" fill="#fff"/><circle cx="14.7" cy="-20" r=".7" fill="#1A1515"/>`;
}
