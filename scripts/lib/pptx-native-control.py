"""Small native PPTX fixture and independent plain-text output validator."""

from datetime import datetime, timezone
import hashlib
import json
import sys

from pptx import Presentation, __version__
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.util import Inches


def slide_text(shapes):
    for shape in shapes:
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from slide_text(shape.shapes)
        elif shape.has_text_frame:
            yield from (paragraph.text.replace("\v", "\n") for paragraph in shape.text_frame.paragraphs)
        elif shape.has_table:
            for row in shape.table.rows:
                yield from (cell.text for cell in row.cells)


def native_text(file):
    presentation = Presentation(file)
    assert [s._element.get("show") for s in presentation.slides] == [None, "0"]
    return "\n".join("".join(line + "\n" for line in slide_text(slide.shapes))
                     for slide in presentation.slides)


def add_text(shapes):
    return shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1)).text_frame


command, source, *args = sys.argv[1:]
if command == "generate":
    assert not args
    presentation = Presentation()
    properties = presentation.core_properties
    properties.created = properties.modified = datetime(2000, 1, 1, tzinfo=timezone.utc)
    visible = presentation.slides.add_slide(presentation.slide_layouts[6])
    body = add_text(visible.shapes)
    body.paragraphs[0].add_run().text = "Native "
    body.paragraphs[0].add_run().text = "PowerPoint 😀"
    paragraph = body.add_paragraph()
    paragraph.add_run().text = "Revenue\t₹42"
    paragraph.add_line_break()
    paragraph.add_run().text = "Second line"
    group = visible.shapes.add_group_shape()
    add_text(group.shapes).text = "Grouped text"
    table = visible.shapes.add_table(1, 2, Inches(1), Inches(4), Inches(4), Inches(1)).table
    table.cell(0, 0).text = "Cell A"
    table.cell(0, 1).text = "Cell B"
    hidden = presentation.slides.add_slide(presentation.slide_layouts[6])
    hidden._element.set("show", "0")
    add_text(hidden.shapes).text = "Hidden appendix"
    hidden.notes_slide.notes_text_frame.text = "Never export these speaker notes"
    with open(source, "xb") as file:
        presentation.save(file)
    expected = "Native PowerPoint 😀\nRevenue\t₹42\nSecond line\nGrouped text\nCell A\nCell B\n\nHidden appendix\n"
    assert native_text(source) == expected
    print(json.dumps({"pythonPptx": __version__, "slides": 2, "hiddenSlides": 1}))
elif command == "validate":
    output, = args
    expected = native_text(source).encode("utf-8")
    with open(output, "rb") as file:
        actual = file.read(4097)
    assert len(actual) <= 4096 and actual == expected
    print(json.dumps({"bytes": len(actual), "sha256": hashlib.sha256(actual).hexdigest(),
                      "independentShapeGroupTableAndHiddenTextMatch": True}))
else:
    raise ValueError("Select generate or validate")
