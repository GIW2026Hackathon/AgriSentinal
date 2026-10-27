"""USSD channel for feature-phone farmers (Africa's Talking compatible)."""

from django.utils import timezone

from . import weather
from .auth import find_or_create_ussd_user
from .crops import CROPS, PRICING, crop_label
from .models import Booking, Facility, Notification, Scan, SupportTicket, TicketMessage, User, UssdLog
from .utils import gen_ref, haversine_km

CROP_MENU = [("tomato", "Tomato"), ("kale", "Kale"), ("avocado", "Avocado"), ("mango", "Mango")]


def _main_menu(phone):
    user = _user_for(phone)
    region = (user.region if user else "") or "Kenya"
    active = 0
    if user:
        active = Booking.objects.filter(farmer=user, status=Booking.STATUS_ACTIVE).count()
    if active:
        status = f"{active} active booking{'s' if active != 1 else ''}"
    else:
        status = "harvest guardian"
    return (
        "CON SENTINEL *384*74#\n"
        f"{region} - {status}\n"
        "1 Scan quality\n"
        "2 Cold storage\n"
        "3 Weather risk\n"
        "4 Support\n"
        "5 My bookings\n"
        "6 Services guide\n"
        "7 Nearest cold room\n"
        "0 Exit"
    )


def _and(*parts):
    return " ".join(part for part in parts if part)


def _menu(text):
    return f"CON {text}"


def _end(text):
    return f"END {text}"


def _user_for(phone):
    return User.objects.filter(phone=phone).first()


def _facilities_for(user):
    region = (user.region if user else "Nakuru") or "Nakuru"
    lat = user.lat if user else -0.3031
    lng = user.lng if user else 36.08
    facilities = [
        f for f in Facility.objects.all()
        if f.available_kg >= 50 and f.status not in (Facility.STATUS_FULL, Facility.STATUS_MAINTENANCE, Facility.STATUS_OFFLINE)
    ]
    facilities.sort(key=lambda f: (f.region != region, haversine_km(lat, lng, f.lat, f.lng) or 999, f.name))
    return facilities[:3], region


def _quality(text, parts):
    ref = parts[1].strip().upper() if len(parts) > 1 else ""
    if not ref:
        return _menu("Enter scan code (e.g. AG-4KD2F):")
    scan = Scan.objects.filter(ref_code__iexact=ref).first()
    if not scan:
        scan = Scan.objects.filter(ref_code__icontains=ref).first()
    if not scan:
        return _end(f"Scan {ref[:10]} not found. Check the code on your receipt or dial again.")
    verdict = "Store cold" if scan.recommended_mode == "cold" else "Ambient ok"
    return _end(
        f"{scan.ref_code} {crop_label(scan.crop)}: {scan.grade} ({scan.quality_score}/100). "
        f"Ambient {scan.shelf_ambient_days:.0f}d, cold {scan.shelf_cold_days:.0f}d. {verdict}."
    )


def _storage(parts, phone):
    user = _user_for(phone)
    facilities, region = _facilities_for(user)
    if len(parts) == 1:
        if not facilities:
            return _end("No Sentinel cold space is available near you right now. Try again later.")
        lines = [f"SENTINEL cold rooms near {region}:"]
        lat = user.lat if user else -0.3031
        lng = user.lng if user else 36.08
        for idx, f in enumerate(facilities, start=1):
            dist = haversine_km(lat, lng, f.lat, f.lng)
            dist_text = f" {dist:.0f}km" if dist is not None else ""
            lines.append(f"{idx} {f.code} {f.region} {f.available_kg}kg{dist_text}")
        lines.append("Reply e.g. 2*1 (choice*facility)")
        return _menu("\n".join(lines))

    try:
        choice = int(parts[1])
        facility = facilities[choice - 1]
    except (ValueError, IndexError):
        return _end("Invalid facility. Dial again and choose 1-3.")

    if len(parts) == 2:
        return _menu(f"{facility.code}: {facility.available_kg}kg free.\nCrop: 1 Tomato 2 Kale 3 Avocado 4 Mango")
    try:
        crop = CROP_MENU[int(parts[2]) - 1]
    except (ValueError, IndexError):
        return _end("Invalid crop. Dial again and choose 1-4.")
    if len(parts) == 3:
        return _menu(f"{crop[1]} selected.\nHow many kg? (10-500)")
    try:
        quantity = int(parts[3])
    except ValueError:
        return _end("Invalid quantity. Enter a number between 10 and 500 kg.")
    if quantity < 10 or quantity > 500:
        return _end("Quantity must be 10-500kg.")
    if quantity > facility.available_kg:
        return _end(f"Only {facility.available_kg}kg free at {facility.code}. Try a smaller quantity.")
    if len(parts) == 4:
        return _menu(f"{quantity}kg selected.\nFor how many days? (1-14)")
    try:
        days = int(parts[4])
    except ValueError:
        return _end("Invalid days. Enter 1-14.")
    if days < 1 or days > 14:
        return _end("Days must be between 1 and 14.")

    user, _ = find_or_create_ussd_user(phone)
    booking = Booking.objects.create(
        ref_code=gen_ref("BK"),
        farmer=user,
        facility=facility,
        crop=crop[0],
        quantity_kg=quantity,
        start_date=timezone.localdate(),
        days=days,
        status=Booking.STATUS_PENDING,
        total_cost=round(quantity * days * PRICING[facility.type], 2),
        notes="Created via USSD",
    )
    Notification.objects.create(
        user=user,
        kind="storage",
        title=f"Booking {booking.ref_code} received",
        body=f"{quantity}kg {crop[1].lower()} for {days} day(s) at {facility.name}.",
        severity="info",
    )
    for staff in User.objects.filter(role__in=User.STAFF_ROLES):
        Notification.objects.create(
            user=staff,
            kind="booking",
            title=f"USSD booking {booking.ref_code}",
            body=f"{user.get_full_name()} requested {quantity}kg at {facility.code}. Awaiting confirmation.",
            severity="info",
        )
    return _end(
        f"Booked {booking.ref_code}: {quantity}kg {crop[1].lower()}, {days}d at {facility.code}. "
        f"KES {booking.total_cost:.0f}. Await provider confirmation."
    )


def _weather(phone):
    user = _user_for(phone)
    region = (user.region if user else "Nakuru") or "Nakuru"
    lat = user.lat if user else -0.3031
    lng = user.lng if user else 36.08
    forecast = weather.get_forecast(lat, lng, region)
    lines = [f"3-day {region}:"]
    for day in forecast["daily"][:3]:
        lines.append(f"{day['day']} {day['temp_max']:.0f}/{day['temp_min']:.0f}C {day['rain_mm']:.0f}mm")
    risk = forecast["summary"]["risk"]
    tip = "Keep harvest shaded." if risk != "low" else "Good harvest window."
    lines.append(f"Risk: {risk}. {tip}")
    return _end("\n".join(lines))


def _support(text, parts, phone):
    if len(parts) == 1:
        return _menu("Describe your issue. Example: 4*My scan failed")
    body = " ".join(parts[1:]).strip() or "Support requested via USSD"
    user, _ = find_or_create_ussd_user(phone)
    ticket = SupportTicket.objects.create(
        ref_code=gen_ref("TS"),
        farmer=user,
        subject=body[:70],
        category="ussd",
        status="open",
        priority="normal",
    )
    TicketMessage.objects.create(ticket=ticket, sender="farmer", author_name=user.get_full_name(), body=body)
    for staff in User.objects.filter(role__in=User.STAFF_ROLES):
        Notification.objects.create(
            user=staff,
            kind="support",
            title=f"USSD support {ticket.ref_code}",
            body=body[:200],
            severity="warning",
        )
    return _end(f"Ticket {ticket.ref_code} created. Our team will call {phone} within 24h. Asante.")


def _bookings(phone):
    user = _user_for(phone)
    if not user:
        return _end("No bookings found for this number. Dial 2 to book cold storage.")
    bookings = Booking.objects.filter(farmer=user).exclude(status=Booking.STATUS_CANCELLED).order_by("-created_at")[:3]
    if not bookings:
        return _end("No bookings yet. Dial 2 to book cold storage.")
    lines = ["My storage:"]
    for b in bookings:
        lines.append(f"{b.ref_code} {b.facility.code} {b.quantity_kg}kg {b.days}d {b.get_status_display()}")
    return _end("\n".join(lines))


def _services():
    return _end(
        "SENTINEL SERVICES\n"
        "1 Scan - grade & shelf life\n"
        "2 Cold - book nearby space\n"
        "3 Weather - 3-day risk\n"
        "4 Support - call back\n"
        "5 Bookings - my storage\n"
        "7 Nearest cold room\n"
        "Dial *384*74#"
    )


def _nearest(phone):
    user = _user_for(phone)
    facilities, region = _facilities_for(user)
    if not facilities:
        return _end("No free Sentinel cold room near you right now. Dial 2 to see all options later.")
    facility = facilities[0]
    lat = user.lat if user else -0.3031
    lng = user.lng if user else 36.08
    dist = haversine_km(lat, lng, facility.lat, facility.lng)
    dist_text = f", {dist:.0f}km away" if dist is not None else ""
    kind = "mobile" if facility.type == Facility.TYPE_MOBILE else "solar"
    return _end(
        f"Nearest: {facility.name} ({kind}){dist_text}.\n"
        f"{facility.available_kg}kg free at {facility.temperature_c}C, KES {PRICING[facility.type]}/kg/day.\n"
        f"Dial 2 to reserve. Region: {region}."
    )


def handle(text, phone):
    text = (text or "").strip()
    parts = [p.strip() for p in text.split("*")]
    if not text:
        return _main_menu(phone), _user_for(phone)
    choice = parts[0]
    if choice == "1":
        return _quality(text, parts), _user_for(phone)
    if choice == "2":
        return _storage(parts, phone), _user_for(phone)
    if choice == "3":
        return _weather(phone), _user_for(phone)
    if choice == "4":
        return _support(text, parts, phone), _user_for(phone)
    if choice == "5":
        return _bookings(phone), _user_for(phone)
    if choice == "6":
        return _services(), _user_for(phone)
    if choice == "7":
        return _nearest(phone), _user_for(phone)
    if choice == "0":
        return _end("Sentinel signing off. Keep your harvest cool. Asante!"), _user_for(phone)
    return _end("Invalid option. Dial again and choose 0-7."), _user_for(phone)


def process(text, phone, session_id="", log=True):
    user = _user_for(phone)
    try:
        response, user = handle(text, phone)
    except Exception:
        response = _end("Service temporarily unavailable. Please try again shortly.")
    if log:
        UssdLog.objects.create(
            session_id=session_id or "",
            phone=phone,
            text=(text or "")[:240],
            response=response,
            user=user if getattr(user, "pk", None) else None,
        )
    return response, user
