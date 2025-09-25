from django.shortcuts import render, redirect
from .models import Link
from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm
from .forms import CustomUserCreationForm

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




