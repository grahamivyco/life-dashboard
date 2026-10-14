export default function Mark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="-540 -540 1080 1080" aria-hidden="true">
      <rect x="-540" y="-540" width="1080" height="1080" rx="260" fill="#111110" />
      <path
        d="M70,-230 H-140 A90,90 0 0 0 -230,-140 V140 A90,90 0 0 0 -140,230 H140 A90,90 0 0 0 230,140 V-70"
        fill="none" stroke="#F3F1EA" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M0,-120 C14,-29 29,-14 120,0 C29,14 14,29 0,120 C-14,29 -29,14 -120,0 C-29,-14 -14,-29 0,-120 Z"
        fill="#F24333"
      />
    </svg>
  )
}
