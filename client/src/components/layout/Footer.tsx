export function Footer() {
  return (
    <footer className="border-t bg-background px-4 py-4 md:px-6">
      <div className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground md:flex-row">
        <p>
          &copy; {new Date().getFullYear()} Slop Studios. All rights reserved.
        </p>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-foreground transition-colors">
            Documentation
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            API Reference
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
