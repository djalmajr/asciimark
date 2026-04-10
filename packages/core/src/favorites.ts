const STORAGE_KEY = "asciimark-favorites";

interface FavoriteFile {
  name: string;
  path: string;
  rootName: string;
  rootPath: string;
}

function readFavorites(): FavoriteFile[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is FavoriteFile =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as FavoriteFile).name === "string" &&
        typeof (item as FavoriteFile).path === "string" &&
        typeof (item as FavoriteFile).rootName === "string" &&
        typeof (item as FavoriteFile).rootPath === "string",
    );
  } catch {
    return [];
  }
}

function getFavorites(): FavoriteFile[] {
  return readFavorites();
}

function addFavorite(file: FavoriteFile): FavoriteFile[] {
  const favorites = readFavorites().filter(
    (f) => !(f.path === file.path && f.rootPath === file.rootPath),
  );
  favorites.unshift(file);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  return favorites;
}

function removeFavorite(path: string, rootPath: string): FavoriteFile[] {
  const favorites = readFavorites().filter(
    (f) => !(f.path === path && f.rootPath === rootPath),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  return favorites;
}

function isFavorite(
  path: string,
  rootPath: string,
  favorites: FavoriteFile[],
): boolean {
  return favorites.some((f) => f.path === path && f.rootPath === rootPath);
}

export {
  type FavoriteFile,
  addFavorite,
  getFavorites,
  isFavorite,
  removeFavorite,
};
