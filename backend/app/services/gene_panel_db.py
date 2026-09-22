"""
DB access for the gene_panels reference table. Raw pymysql, matching the
rest of BioLedger's backend (no ORM).

Assumes `get_connection()` already exists in app/database.py (same helper
used by patient_routes / sample_routes / report_worker). Adjust the import
below if your actual helper has a different name.
"""

from database import get_connection
from app.services.gene_panel_parser import ParsedGeneRecord


def replace_gene_panels(records: list[ParsedGeneRecord], source_file: str) -> int:
    """
    Wipes and reloads the entire gene_panels table from a fresh upload.
    Reference/master data -- each upload is treated as the new source of
    truth, not an incremental append. Runs as a single transaction so a
    failure mid-insert doesn't leave the table half-populated.

    Returns the number of rows inserted.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE gene_panels")

            insert_sql = (
                "INSERT INTO gene_panels (gene_symbol, category, panel, source_file) "
                "VALUES (%s, %s, %s, %s)"
            )
            rows = [(r.gene_symbol, r.category, r.panel, source_file) for r in records]

            batch_size = 1000
            for i in range(0, len(rows), batch_size):
                cur.executemany(insert_sql, rows[i:i + batch_size])

        conn.commit()
        return len(rows)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_gene_panel_stats() -> dict:
    """
    Returns overall + per-panel counts for the stat cards.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT category, COUNT(*) AS cnt FROM gene_panels GROUP BY category"
            )
            category_rows = cur.fetchall()

            cur.execute(
                "SELECT category, panel, COUNT(*) AS cnt FROM gene_panels "
                "GROUP BY category, panel ORDER BY category, panel"
            )
            panel_rows = cur.fetchall()

            cur.execute("SELECT COUNT(*) AS cnt FROM gene_panels")
            total_row = cur.fetchone()

            cur.execute("SELECT MAX(uploaded_at) AS last_uploaded FROM gene_panels")
            last_uploaded_row = cur.fetchone()
    finally:
        conn.close()

    category_totals = {row["category"]: row["cnt"] for row in category_rows}

    panels = []
    for row in panel_rows:
        panels.append({
            "category": row["category"],
            "panel": row["panel"],
            "count": row["cnt"],
        })

    return {
        "total_genes": total_row["cnt"] if total_row else 0,
        "cancerous_genes": category_totals.get("cancerous", 0),
        "non_cancerous_genes": category_totals.get("non_cancerous", 0),
        "panels": panels,
        "last_uploaded_at": last_uploaded_row["last_uploaded"] if last_uploaded_row else None,
    }


def get_gene_category_lookup() -> dict:
    """
    Loads the entire gene_panels table into a dict keyed by uppercased gene
    symbol, for use by variant_parser.py to classify each variant's gene as
    cancerous/non_cancerous/both — one query per upload, not one per row.

    Returns: { "TP53": [{"category": "cancerous", "panel": "Somatic"}, ...], ... }

    Deliberately loaded in full rather than queried per gene: gene_panels
    is reference data (a few thousand rows), so this is cheap and avoids
    thousands of individual lookups against a variant file's gene column.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT gene_symbol, category, panel FROM gene_panels")
            rows = cur.fetchall()
    finally:
        conn.close()

    lookup: dict = {}
    for row in rows:
        key = row["gene_symbol"].strip().upper()
        lookup.setdefault(key, []).append({"category": row["category"], "panel": row["panel"]})
    return lookup


def get_genes(
    category: str | None = None,
    panel: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Paginated, filterable gene list for the table view.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            where_clauses = []
            params: list = []

            if category:
                where_clauses.append("category = %s")
                params.append(category)
            if panel:
                where_clauses.append("panel = %s")
                params.append(panel)
            if search:
                where_clauses.append("gene_symbol LIKE %s")
                params.append(f"{search.upper()}%")

            where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

            cur.execute(f"SELECT COUNT(*) AS cnt FROM gene_panels {where_sql}", params)
            total = cur.fetchone()["cnt"]

            offset = (page - 1) * page_size
            cur.execute(
                f"SELECT gene_symbol, category, panel FROM gene_panels {where_sql} "
                f"ORDER BY gene_symbol ASC LIMIT %s OFFSET %s",
                params + [page_size, offset],
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "genes": rows,
    }


def get_multi_panel_genes(
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Genes that appear in more than one panel (e.g. AARS2 in both Cardiac
    and NDD). Rows in gene_panels stay one-per-(gene, panel) as stored;
    this just groups them for a "which genes overlap" view.

    Each returned gene includes its full list of {category, panel} pairs
    it was found under.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            search_clause = ""
            search_params: list = []
            if search:
                search_clause = "WHERE gene_symbol LIKE %s"
                search_params.append(f"{search.upper()}%")

            # Count how many distinct genes have >1 distinct panel
            cur.execute(
                f"""
                SELECT COUNT(*) AS cnt FROM (
                    SELECT gene_symbol
                    FROM gene_panels
                    {search_clause}
                    GROUP BY gene_symbol
                    HAVING COUNT(DISTINCT panel) > 1
                ) AS multi
                """,
                search_params,
            )
            total = cur.fetchone()["cnt"]

            offset = (page - 1) * page_size
            cur.execute(
                f"""
                SELECT
                    gene_symbol,
                    COUNT(DISTINCT panel) AS panel_count,
                    GROUP_CONCAT(DISTINCT CONCAT(category, ':', panel) ORDER BY panel SEPARATOR '|') AS panel_list
                FROM gene_panels
                {search_clause}
                GROUP BY gene_symbol
                HAVING panel_count > 1
                ORDER BY panel_count DESC, gene_symbol ASC
                LIMIT %s OFFSET %s
                """,
                search_params + [page_size, offset],
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    genes = []
    for row in rows:
        pairs = []
        for entry in row["panel_list"].split("|"):
            category, panel = entry.split(":", 1)
            pairs.append({"category": category, "panel": panel})
        genes.append({
            "gene_symbol": row["gene_symbol"],
            "panel_count": row["panel_count"],
            "panels": pairs,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "genes": genes,
    }