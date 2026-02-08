export const highlightLsOutput = (output: string): string => {
  const lines = output.split('\n');
  let highlightedLines = [];

  for (let line of lines) {
    // Skip empty lines
    if (!line.trim()) {
      highlightedLines.push(line);
      continue;
    }

    // Try to detect if this is a directory or file just by name patterns
    // This is a simplified approach when we can't rely on ls output format
    const parts = line.trim().split(/\s+/);
    const lastPart = parts[parts.length - 1];

    // Check for directory name pattern (no extension, or ends with /)
    if (lastPart.endsWith('/') ||
      !lastPart.includes('.') ||
      /^[A-Z][a-z]+$/.test(lastPart)) { // Capital first letter, rest lowercase (common for folders)
      line = line.replace(lastPart, `\x1b[1;34m${lastPart}\x1b[0m`); // Bright blue for directories
    }
    // Check for executable name pattern (no extension on Unix executables)
    else if (/^[a-z0-9_-]+$/.test(lastPart) && !lastPart.includes('.')) {
      line = line.replace(lastPart, `\x1b[1;32m${lastPart}\x1b[0m`); // Bright green for executables
    }
    // Check for image files
    else if (/\.(jpg|jpeg|png|gif|bmp|svg)$/i.test(lastPart)) {
      line = line.replace(lastPart, `\x1b[1;35m${lastPart}\x1b[0m`); // Magenta for images
    }
    // Check for archive files
    else if (/\.(zip|tar|gz|bz2|xz|rar|7z)$/i.test(lastPart)) {
      line = line.replace(lastPart, `\x1b[1;31m${lastPart}\x1b[0m`); // Red for archives
    }

    highlightedLines.push(line);
  }

  return highlightedLines.join('\n');
};
