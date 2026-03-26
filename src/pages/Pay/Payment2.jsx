import { useLocation } from 'react-router-dom';
import './Pay.scss';
import { useEffect, useState, useContext, useRef } from 'react';
import AppHelmet from '../AppHelmet';
import ScrollToTop from '../ScrollToTop';
import Loader from '../../components/Loader/Loader';
import { useNavigate } from 'react-router-dom';
import { products } from '../../data';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { dataState, notificationState, userState } from '../../recoil/atoms';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { addPurchase, getUser } from '../../firebase';
import Swal from "sweetalert2";

// PayPal configuration
const paypalInitialOptions = {
  "client-id": "AXIggvGGvXozbZhdkvizPLd89nVYW8KoyNlHO0gHx7hjY_Ah_IfgXihUQGf7T2HUUVYx-D5SNncM0CtU",
  currency: "USD",
  intent: "capture",
};

// Pesapal configuration
const PESAPAL_API_BASE = 'https://all-payments-api-production.up.railway.app/api/pesapal';
const PESAPAL_CONSUMER_KEY = "cULxDBhV1CcQtU5zhj00Q+N7AfhJmTs8";
const PESAPAL_CONSUMER_SECRET = "fCfvb6RVfK5X1759JgsP/ZYSfDA=";

// Fixed exchange rate (approximate KSH to USD)
const EXCHANGE_RATE = 129; // 1 USD = 129 KSH

export default function Payment2() {
  const [user, setUser] = useRecoilState(userState);
  const [loading, setLoading] = useState(false);
  const [paymentType, setPaymentType] = useState("mpesa");
  const location = useLocation();
  const [data, setData] = useState(dataState);
  const setNotification = useSetRecoilState(notificationState);
  const navigate = useNavigate();
  
  // Pesapal states
  const [processing, setProcessing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [orderTrackingId, setOrderTrackingId] = useState(null);
  const pollIntervalRef = useRef(null);
  
  // PayPal state
  const [paypalKey, setPaypalKey] = useState(0);

  useEffect(() => {
    if (location.state) {
      setData(location.state.data)
    } else {
      setData(products[0])
    }
  }, [location]);

  // Get price in USD for PayPal
  const getCurrentPriceInUsd = () => {
    if (paymentType === "paypal") {
      return (data.price / EXCHANGE_RATE).toFixed(2);
    }
    return (data.price / EXCHANGE_RATE).toFixed(2);
  };

  // Get display price
  const getDisplayPrice = () => {
    if (paymentType === "mpesa") {
      return `KSH ${data.price}`;
    } else {
      return `$${(data.price / EXCHANGE_RATE).toFixed(2)}`;
    }
  };

  // Handle successful upgrade/purchase
  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const currentDate = new Date().toISOString();
      await addPurchase(user.email, {
        date: currentDate,
        delivered: false,
        paid: true,
        amount: data.price,
        item: data.title,
        plan: data.plan,
        billing: data.billing,
      }, setNotification).then(() => {
        getUser(user.email, setUser);
      });
      
      await Swal.fire({
        icon: 'success',
        title: '🎉 Purchase Successful!',
        html: `
          <div style="text-align: center;">
            <h3 style="color: #4CAF50; margin-bottom: 15px;">Payment Successful!</h3>
            <p>You have successfully purchased:</p>
            <p><strong>${data.title}</strong></p>
            <p><strong>${data.plan} Plan - ${data.billing}</strong></p>
            <p style="font-size: 14px; color: #666; margin-top: 10px;">Thank you for your purchase!</p>
          </div>
        `,
        showConfirmButton: true,
        confirmButtonColor: '#4CAF50',
        confirmButtonText: 'Continue',
        timer: 5000,
        timerProgressBar: true,
      });
      
      navigate("/", { replace: true });
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'Purchase Failed',
        text: error.message,
        confirmButtonColor: '#d33',
      });
    } finally {
      setLoading(false);
    }
  };

  // PayPal order creation
  const createPayPalOrder = (data, actions) => {
    const usdPrice = getCurrentPriceInUsd();
    return actions.order.create({
      purchase_units: [
        {
          amount: {
            value: usdPrice,
            currency_code: "USD",
          },
          description: `${data.title} - ${data.plan} Plan (${data.billing})`,
        },
      ],
    });
  };

  // PayPal approval handler
  const onPayPalApprove = (data, actions) => {
    return actions.order.capture().then(function (details) {
      console.log("PayPal payment completed:", details);
      handleUpgrade();
    });
  };

  // PayPal error handler
  const onPayPalError = (err) => {
    console.error("PayPal error:", err);
    Swal.fire({
      icon: 'error',
      title: 'Payment Failed',
      text: 'Please try again or use another payment method.',
      confirmButtonColor: '#d33',
    });
  };

  // Pesapal: Function to check payment status
  const checkPaymentStatus = async (orderTrackingId, handleUpgrade, stopPolling) => {
    const paymentData = {
      orderTrackingId,
      consumerKey: PESAPAL_CONSUMER_KEY,
      consumerSecret: PESAPAL_CONSUMER_SECRET
    };

    try {
      const res = await fetch(`${PESAPAL_API_BASE}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      });
    
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      console.log('Payment Status:', data);
      
      const status = data.payment_status_description || '';
      const statusCode = data.status_code;
      
      // COMPLETED - Payment successful
      if (status === 'COMPLETED' || statusCode === 1) {
        stopPolling();
        await handleUpgrade();
        return { completed: true, status: 'success' };
      } 
      // FAILED - Payment failed
      else if (status === 'FAILED' || statusCode === 2) {
        stopPolling();
        return { completed: false, status: 'failed' };
      }
      // REVERSED - Payment was reversed
      else if (status === 'REVERSED' || statusCode === 3) {
        stopPolling();
        return { completed: false, status: 'reversed' };
      }
      // INVALID - Payment not yet processed
      else if (status === 'INVALID' || statusCode === 0) {
        return { completed: false, status: 'pending' };
      }
      
      return { completed: false, status: 'pending' };
    } catch (err) {
      return { completed: false, status: 'error', error: err.message };
    }
  };

  // Pesapal: Function to open the payment modal
  const openPaymentModal = (paymentUrl, trackingId) => {
    let pollCount = 0;
    const MAX_POLLS = 60;
    
    Swal.fire({
      title: 'Complete Your Payment',
      html: `
        <div style="width: 100%; height: 500px; overflow: hidden; position: relative;">
          <iframe 
            src="${paymentUrl}" 
            style="width: 100%; height: 100%; border: none;"
            title="Pesapal Payment"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-top-navigation-by-user-activation"
            allow="payment *;"
          ></iframe>
        </div>
        <div style="margin-top: 10px; text-align: center; font-size: 12px; color: #666;">
          Complete payment in the window above. This will close automatically when payment is confirmed.
        </div>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      width: '900px',
      customClass: {
        popup: 'payment-modal-popup'
      },
      didOpen: () => {
        // Start polling after 15 seconds
        setTimeout(() => {
          setPolling(true);
          
          pollIntervalRef.current = setInterval(async () => {
            pollCount++;
            console.log(`Polling payment status (${pollCount}/${MAX_POLLS}) for:`, trackingId);
            
            try {
              const result = await checkPaymentStatus(
                trackingId, 
                handleUpgrade, 
                () => {
                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                  setPolling(false);
                  Swal.close();
                }
              );
              
              if (result.completed && result.status === 'success') {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setPolling(false);
                Swal.close();
              } else if (result.status === 'failed' || result.status === 'reversed') {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setPolling(false);
                Swal.close();
                
                setTimeout(async () => {
                  await Swal.fire({
                    icon: 'error',
                    title: 'Payment Failed',
                    text: 'Your payment could not be processed. Please try again.',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'Try Again',
                  });
                }, 300);
              }
              
              if (pollCount >= MAX_POLLS) {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setPolling(false);
                Swal.close();
                
                setTimeout(async () => {
                  await Swal.fire({
                    icon: 'warning',
                    title: 'Payment Status Timeout',
                    html: `
                      <div style="text-align: center;">
                        <p>We're still waiting for payment confirmation.</p>
                        <p>Please check your email for payment receipt.</p>
                        <button onclick="window.location.reload()" style="background: #3085d6; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; margin-top: 10px;">
                          Refresh Page
                        </button>
                      </div>
                    `,
                    showConfirmButton: false,
                    showCloseButton: true,
                  });
                }, 300);
              }
            } catch (err) {
              console.error('Error in polling:', err);
            }
          }, 5000);
        }, 15000);
      },
      willClose: () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setPolling(false);
      }
    });
  };

  // Pesapal: Handle payment initialization
  const handlePesapalPayment = async () => {
    if (!user) {
      await Swal.fire({
        icon: 'warning',
        title: 'Login Required',
        text: 'Please login first to continue with payment',
        confirmButtonColor: '#3085d6',
        confirmButtonText: 'Login Now',
        showCancelButton: true,
      }).then((result) => {
        if (result.isConfirmed) {
          navigate('/login');
        }
      });
      return;
    }

    // Show confirmation dialog
    const result = await Swal.fire({
      icon: 'question',
      title: 'Confirm Payment',
      html: `
        <div style="text-align: left; padding: 5px;">
          <p><strong>Item:</strong> ${data.title}</p>
          <p><strong>Plan:</strong> ${data.plan} Plan - ${data.billing}</p>
          <p><strong>Amount:</strong> KSH ${data.price}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#4CAF50',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, proceed',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    const paymentData = {
      amount: data.price,
      email: user.email,
      description: `${data.title} - ${data.plan} Plan (${data.billing})`,
      countryCode: "KE",
      currency: "KES",
      url: window.location.origin + window.location.pathname,
      callbackUrl: window.location.origin + '/payment-callback',
      consumerKey: PESAPAL_CONSUMER_KEY,
      consumerSecret: PESAPAL_CONSUMER_SECRET
    };

    setProcessing(true);
    try {
      const res = await fetch(`${PESAPAL_API_BASE}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const myData = await res.json();
      
      if (myData.order_tracking_id) {
        setOrderTrackingId(myData.order_tracking_id);
      }
      
      await Swal.fire({
        icon: 'success',
        title: 'Payment Initialized!',
        text: 'Redirecting you to payment gateway...',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true
      });
      
      setProcessing(false);
      
      setTimeout(() => {
        openPaymentModal(myData.redirect_url, myData.order_tracking_id);
      }, 100);
      
    } catch (err) {
      setProcessing(false);
      await Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: 'Error: ' + err.message,
        confirmButtonColor: '#d33',
        confirmButtonText: 'OK',
      });
    }
  };

  // Handle callback from Pesapal
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const trackingId = urlParams.get('OrderTrackingId');
    const notificationType = urlParams.get('OrderNotificationType');
    
    if (trackingId && notificationType === 'CALLBACKURL' && !polling && !processing) {
      setProcessing(true);
      
      Swal.fire({
        title: 'Verifying Payment',
        text: 'Please wait while we confirm your payment...',
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
      
      checkPaymentStatus(trackingId, handleUpgrade, () => {
        setProcessing(false);
        Swal.close();
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Force PayPal buttons to re-render when price changes
  useEffect(() => {
    if (paymentType === "paypal") {
      setPaypalKey(prev => prev + 1);
    }
  }, [data, paymentType]);

  return (
    <PayPalScriptProvider options={paypalInitialOptions}>
      <div className='pay'>
        <AppHelmet title={"Payment"} />
        <ScrollToTop />
        {
          loading && <Loader />
        }

        {data && <h4>Payment Of {getDisplayPrice()}</h4>}
        {data && <h4>{data.plan} Plan For A {data.billing}</h4>}
        
        <form className="method">
          <fieldset>
            <input 
              name="payment-method" 
              type="radio" 
              value={"mpesa"} 
              id="mpesa" 
              checked={paymentType === "mpesa"} 
              onChange={(e) => setPaymentType(e.target.value)} 
            />
            <label htmlFor="mpesa">📲 Mobile Payment (M-Pesa/Card)</label>
          </fieldset>
          {/*<fieldset>
            <input 
              name="payment-method" 
              type="radio" 
              value={"paypal"} 
              id="paypal" 
              checked={paymentType === "paypal"} 
              onChange={(e) => setPaymentType(e.target.value)} 
            />
            <label htmlFor="paypal">💳 PayPal/Credit Card</label>
          </fieldset>*/}
        </form>
        
        {paymentType === "mpesa" ? (
          <button 
            onClick={handlePesapalPayment} 
            className='btn'
            disabled={processing || polling}
          >
            {processing ? (
              <span><i className="fas fa-spinner fa-spin"></i> PROCESSING...</span>
            ) : polling ? (
              <span><i className="fas fa-clock"></i> CHECKING PAYMENT...</span>
            ) : (
              <span><i className="fas fa-lock"></i> Pay with Pesapal</span>
            )}
          </button>
        ) : (
          <div className="paypal-container">
            <PayPalButtons
              key={paypalKey}
              style={{
                layout: "horizontal",
                color: "gold",
                shape: "pill",
                label: "pay",
                height: 45,
              }}
              createOrder={createPayPalOrder}
              onApprove={onPayPalApprove}
              onError={onPayPalError}
              forceReRender={[data.price]}
            />
            <p style={{ textAlign: 'center', marginTop: '15px', fontSize: '14px', opacity: 0.8 }}>
              Paying: {getDisplayPrice()} for {data.title} - {data.plan} Plan
            </p>
          </div>
        )}
      </div>
    </PayPalScriptProvider>
  );
}
