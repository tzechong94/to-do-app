import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EMPTY, empty, Observable, Subject, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { catchError, switchMap, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class WebReqInterceptor implements HttpInterceptor {

  constructor(private authService: AuthService) { }
  
  refreshingAccessToken: boolean | undefined;

  accessTokenRefreshed: Subject<any> = new Subject();


  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<any> {
      request = this.addAuthHeader(request);

      return next.handle(request).pipe(
        catchError((error: HttpErrorResponse) => {
          console.log(error);

          if (error.status === 401){
            //refresh access token  
            return this.refreshAccessToken()
              .pipe(
                switchMap(()=>{
                  request = this.addAuthHeader(request);
                  return next.handle(request);
                }),
                catchError((err:any)=>{
                  console.log(err);
                  this.authService.logout();
                  return EMPTY;
                })
              )
          }
          return throwError(error);
        })
      )
  }

  refreshAccessToken(){

    if (this.refreshingAccessToken){
      return new Observable(observer => {
        this.accessTokenRefreshed.subscribe(()=>{
          //this code will run when the access token has been refreshed
          observer.next();
          observer.complete();
        })
      })
    } else {
    //call method in auth service to send a request to refresh access token
    this.refreshingAccessToken = true;
    return this.authService.getNewAccessToken().pipe(
      tap(()=>{
        console.log("access token refreshed");
        this.refreshingAccessToken = false;
      })
    )}
  }

  addAuthHeader(request: HttpRequest<any>) {
    // get access token
    const token = this.authService.getAccessToken();

    if (token) {
      return request.clone({
        setHeaders: {
          // append the access token to the request header

          'x-access-token': token
        }

      })
    }
    return request;
  }
}
