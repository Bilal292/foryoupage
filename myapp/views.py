from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .models import Link
from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm
from .forms import CustomUserCreationForm, LinkCheckForm, LinkPostForm
import re


ALLOWED_PLATFORMS = {
    "TikTok": r"tiktok\.com",
    "YouTube Shorts": r"youtube\.com\/shorts",
    "Instagram Reels": r"instagram\.com\/reel",
    "X (Twitter)": r"x\.com|twitter\.com",
}


def index(request):
    links = Link.objects.all().order_by("-created_at")
    return render(request, 'index.html', {"links": links})


# ---- USER ACCOUNT VIEWS ----
def register(request):
    if request.user.is_authenticated:
        return redirect('post_list') 
    
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            form.save()

            return redirect('login')
    else:
        form = CustomUserCreationForm()

    return render(request, 'account/register.html', {'form': form})

def user_login(request):
    if request.user.is_authenticated:
        return redirect('index') 

    if request.method == 'POST':
        form = AuthenticationForm(data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)

            return redirect('index') 
    else:
        form = AuthenticationForm()

    return render(request, 'account/login.html', {'form': form})

def user_logout(request):
    logout(request)
    return redirect('index')


# ---- add Link ----
@login_required
def add_link(request):
    platform_detected = None
    post_form = None
    check_form = LinkCheckForm()

    if request.method == "POST":
        if "check_link" in request.POST:
            check_form = LinkCheckForm(request.POST)
            if check_form.is_valid():
                url = check_form.cleaned_data["url"]

                for name, pattern in ALLOWED_PLATFORMS.items():
                    if re.search(pattern, url, re.IGNORECASE):
                        platform_detected = name
                        request.session["pending_link"] = {"url": url, "platform": platform_detected}
                        break

                if not platform_detected:
                    check_form.add_error("url", "This platform is not allowed.")

        elif "post_link" in request.POST:
            post_form = LinkPostForm(request.POST)
            if post_form.is_valid():
                pending = request.session.get("pending_link")
                if pending:
                    Link.objects.create(
                        title=post_form.cleaned_data["title"],
                        url=pending["url"],
                        platform=pending["platform"],
                        user=request.user
                    )
                    del request.session["pending_link"]
                    return redirect("index")
    else:
        check_form = LinkCheckForm()

    if request.session.get("pending_link"):
        post_form = LinkPostForm()
        platform_detected = request.session["pending_link"]["platform"]

    return render(request, "add_link.html", {
        "check_form": check_form,
        "post_form": post_form,
        "platform_detected": platform_detected
    })


