from fastapi import APIRouter, Depends, Header
import structlog

from app.auth import verify_token
from app.services.pdf_service import PdfService
from app.schemas.requests import PdfAnalyzeRequest

router = APIRouter()
logger = structlog.get_logger()


@router.post("/pdf/analyze")
async def analyze_pdf(
    request: PdfAnalyzeRequest,
    token: str = Depends(verify_token),
    x_request_id: str = Header(None, alias="X-Request-ID"),
):
    logger.info(
        "PDF analyze request",
        request_id=x_request_id,
        document_id=request.document_id,
    )

    service = PdfService()
    result = await service.analyze(request)

    return {"status": "ok", "analysis": result}
