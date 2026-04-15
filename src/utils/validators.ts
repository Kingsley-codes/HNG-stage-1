export const validateName = (name: any): { valid: boolean; error?: string } => {
  if (!name) {
    return { valid: false, error: "Name is required" };
  }

  if (typeof name !== "string") {
    return { valid: false, error: "Name must be a string" };
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { valid: false, error: "Name cannot be empty" };
  }

  if (trimmedName.length > 100) {
    return { valid: false, error: "Name must be less than 100 characters" };
  }

  // Check if name contains only letters, spaces, and common punctuation
  const nameRegex = /^[a-zA-Z\s\-'.]+$/;
  if (!nameRegex.test(trimmedName)) {
    return { valid: false, error: "Name contains invalid characters" };
  }

  return { valid: true };
};

export const getAgeGroup = (
  age: number,
): "child" | "teenager" | "adult" | "senior" => {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
};
