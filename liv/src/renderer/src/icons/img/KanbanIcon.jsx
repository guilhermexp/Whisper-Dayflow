export const KanbanIcon = (props) => {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      {/* Trello-style kanban icon */}
      <rect x="2" y="2" width="20" height="20" rx="3" opacity="0.15" />
      {/* Left column - 3 cards */}
      <rect x="4" y="5" width="6" height="3" rx="1" />
      <rect x="4" y="10" width="6" height="3" rx="1" />
      <rect x="4" y="15" width="6" height="3" rx="1" />
      {/* Right column - 2 cards */}
      <rect x="14" y="5" width="6" height="3" rx="1" />
      <rect x="14" y="10" width="6" height="3" rx="1" />
    </svg>
  );
};
