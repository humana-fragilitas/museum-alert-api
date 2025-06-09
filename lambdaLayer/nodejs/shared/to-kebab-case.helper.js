export function toKebabCase(input) {
    return (input || "")
        .trim() // Remove leading and trailing spaces
        .toLowerCase() // Convert to lowercase
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
        .replace(/ /g, '-'); // Replace spaces with minus character
}

/*

function advancedSanitizeCompanyName(companyName: string): string {
  return companyName
    .trim()                                    // Remove leading/trailing spaces
    .replace(/\s+/g, '-')                     // Replace spaces with hyphens
    .replace(/[^\w\-]/g, '')                  // Keep only alphanumeric, underscore, hyphen
    .replace(/-+/g, '-')                      // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, '')                  // Remove leading/trailing hyphens
    .toLowerCase();                           // Convert to lowercase
}

*/