import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

const { width } = vi.hoisted(() => ({ width: { current: 0 } }))
vi.mock("@/hooks/use-element-width", () => ({ useElementWidth: () => width.current }))

import { DataTable, type DataTableColumn } from "./data-table"

interface Row { id: number; name: string; role: string }

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", render: (r) => r.name, listCell: (r) => r.name, listGrow: true, sortValue: (r) => r.name },
  { key: "email", header: "Email", render: (r) => `${r.name}@acme.test` },
  { key: "role", header: "Role", render: (r) => r.role, listCell: (r) => r.role },
]

const rows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i, name: `Name ${i}`, role: "Member" }))

/** Un tableau dans un volet étroit devient une liste (R141) ; il revient à pleine largeur, avec son tri. */
describe("DataTable", () => {
  beforeEach(() => { width.current = 0 })

  it("is a table when there is room, with its header and its pagination", () => {
    width.current = 900
    render(<DataTable columns={columns} data={rows(2)} rowKey={(r) => r.id} />)

    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Name" })).toBeInTheDocument()
    expect(screen.getByText("Name 0@acme.test")).toBeInTheDocument()
  })

  it("stays a table before it is measured", () => {
    render(<DataTable columns={columns} data={rows(2)} rowKey={(r) => r.id} />)
    expect(screen.getByRole("table")).toBeInTheDocument()
  })

  it("under 720 px is a list: no table, no header, no column without a place on the row, no pagination", () => {
    width.current = 600
    render(<DataTable columns={columns} data={rows(2)} rowKey={(r) => r.id} />)

    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.queryByRole("button", { name: "Name" })).toBeNull()
    expect(screen.queryByText("Name 0@acme.test")).toBeNull()
    expect(screen.queryByText(/Rows per page/)).toBeNull()
    const row = screen.getAllByRole("listitem")[0]
    expect(row.className).toContain("h-9")
    expect(within(row).getByText("Name 0")).toBeInTheDocument()
    expect(within(row).getByText("Member")).toBeInTheDocument()
  })

  it("a table without list cells stays a table, however narrow", () => {
    width.current = 400
    render(<DataTable columns={[{ key: "name", header: "Name", render: (r: Row) => r.name }]} data={rows(1)} rowKey={(r) => r.id} />)

    expect(screen.getByRole("table")).toBeInTheDocument()
  })

  it("a row opens with a click or Enter, and only when it leads somewhere", () => {
    width.current = 600
    const onRowClick = vi.fn()
    const data = rows(2)
    render(<DataTable columns={columns} data={data} rowKey={(r) => r.id} onRowClick={onRowClick} isRowClickable={(r) => r.id === 0} />)

    const [row] = screen.getAllByRole("button")
    expect(screen.getAllByRole("button")).toHaveLength(1)
    fireEvent.click(row)
    fireEvent.keyDown(row, { key: "Enter" })
    expect(onRowClick).toHaveBeenCalledTimes(2)
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })

  it("says when there is nothing, in one line", () => {
    width.current = 600
    render(<DataTable columns={columns} data={[]} rowKey={(r) => r.id} emptyMessage="Nobody here." />)

    expect(screen.getByText("Nobody here.")).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("keeps the pages beyond a few dozen rows", () => {
    width.current = 600
    render(<DataTable columns={columns} data={rows(60)} rowKey={(r) => r.id} pageSize={25} />)

    expect(screen.getAllByRole("listitem")).toHaveLength(25)
  })
})
