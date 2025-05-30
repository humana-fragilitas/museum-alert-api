export default function toKebabCase(input) {
    return (input || "")
        .trim() // Remove leading and trailing spaces
        .toLowerCase() // Convert to lowercase
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
        .replace(/ /g, '-'); // Replace spaces with minus character
}