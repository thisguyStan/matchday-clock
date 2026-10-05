interface HourglassIconProps {
  className?: string;
}

export function HourglassIcon({ className }: HourglassIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 3h12M6 21h12M7 3c0 5.5 5 6 5 9s-5 3.5-5 9m10-18c0 5.5-5 6-5 9s5 3.5 5 9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M9 7h6m-6 10h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
