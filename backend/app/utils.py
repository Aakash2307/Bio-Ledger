from datetime import datetime


def normalize_date(value: str | None) -> str | None:
    """
    Accepts multiple date formats and always returns YYYY-MM-DD.
    Handles: '28-Nov-24', '10/17/2025', '2025-10-17'
    """
    if not value or not value.strip():
        return value
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d-%b-%y", "%d-%b-%Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Return as-is if nothing matched (don't crash)
    return value


def to_iso_sql(col: str) -> str:
    """
    SQLite expression that converts any stored date format to YYYY-MM-DD.
    Handles: YYYY-MM-DD (already clean), MM/DD/YYYY, DD-Mon-YY
    """
    return f"""CASE
        WHEN {col} LIKE '__/__/____' THEN
            substr({col},7,4) || '-' || substr({col},1,2) || '-' || substr({col},4,2)
        WHEN {col} LIKE '__-___-__' THEN
            '20' || substr({col},8,2) || '-' ||
            CASE substr({col},4,3)
                WHEN 'Jan' THEN '01' WHEN 'Feb' THEN '02' WHEN 'Mar' THEN '03'
                WHEN 'Apr' THEN '04' WHEN 'May' THEN '05' WHEN 'Jun' THEN '06'
                WHEN 'Jul' THEN '07' WHEN 'Aug' THEN '08' WHEN 'Sep' THEN '09'
                WHEN 'Oct' THEN '10' WHEN 'Nov' THEN '11' WHEN 'Dec' THEN '12'
            END || '-' || substr({col},1,2)
        ELSE {col}
    END"""