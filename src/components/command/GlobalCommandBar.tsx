import React from 'react'

interface GlobalCommandBarProps {
  onClick: () => void
  className?: string
}

export const GlobalCommandBar: React.FC<GlobalCommandBarProps> = ({
  onClick,
  className = ''
}) => {
  return (
    <button
      onClick={onClick}
      className={`h-10 w-10 hover:bg-accent rounded-md transition-colors flex items-center justify-center cursor-pointer ${className}`}
      title="Global Command Center (⌘K)"
    >
      <img
        src="./Odyssey.png"
        alt="Odyssey"
        className="h-8 w-8 object-cover"
      />
    </button>
  )
}